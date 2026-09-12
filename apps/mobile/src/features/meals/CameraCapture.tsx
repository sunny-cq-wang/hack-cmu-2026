/**
 * The camera pane of the Log tab: live preview, shutter, gallery picker.
 *
 * It owns the whole "get me a JPEG" step — take or pick, then resize through
 * `prepareMealPhoto` — so `onCaptured` always hands back a URI that is ready for
 * `POST /meals/analyze`. The route only moves the state machine along.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Images } from 'lucide-react-native';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, colors, radius, spacing, typography } from '../../components/ui';
import { log } from '../../lib/log';
import { prepareMealPhoto } from './photo';

export interface CameraCaptureProps {
  /** Shutter pressed / photo picked — the route enters `capturing` here. */
  onCaptureStart: () => void;
  /** A resized JPEG is on disk — the route enters `analyzing` here. */
  onCaptured: (uri: string) => void;
  onCaptureFailed: (message: string) => void;
  /** True while the route is busy; the controls lock and a spinner covers the preview. */
  busy?: boolean;
}

export function CameraCapture({
  onCaptureStart,
  onCaptured,
  onCaptureFailed,
  busy = false,
}: CameraCaptureProps): React.JSX.Element {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const takePhoto = async (): Promise<void> => {
    const camera = cameraRef.current;
    if (!camera || busy) {
      return;
    }
    onCaptureStart();
    try {
      const picture = await camera.takePictureAsync({ quality: 1 });
      onCaptured(await prepareMealPhoto(picture.uri, picture.width));
    } catch (cause) {
      log.warn('meals', 'camera capture failed', { message: String(cause) });
      onCaptureFailed('Could not take that photo. Try again.');
    }
  };

  const pickFromGallery = async (): Promise<void> => {
    if (busy) {
      return;
    }
    const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!library.granted) {
      onCaptureFailed('PetPlate needs photo access to log a meal from your gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) {
      return;
    }
    onCaptureStart();
    try {
      onCaptured(await prepareMealPhoto(asset.uri, asset.width));
    } catch (cause) {
      log.warn('meals', 'gallery import failed', { message: String(cause) });
      onCaptureFailed('Could not read that photo. Try another one.');
    }
  };

  if (!permission) {
    return (
      <View style={[styles.pane, styles.centered]}>
        <ActivityIndicator color={colors.thriving} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.pane, styles.centered, styles.permission]}>
        <Text style={typography.heading}>Camera access needed</Text>
        <Text style={[typography.caption, styles.permissionCopy]}>
          PetPlate reads your plate from a photo. You can also pick one from your gallery.
        </Text>
        <Button title="Allow camera" onPress={() => void requestPermission()} fullWidth={false} />
        <Button
          title="Choose from gallery"
          variant="secondary"
          onPress={() => void pickFromGallery()}
          fullWidth={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.pane}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo from your gallery"
          disabled={busy}
          onPress={() => void pickFromGallery()}
          style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed, busy && styles.locked]}
        >
          <Images size={20} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take a photo of this meal"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => void takePhoto()}
          style={({ pressed }) => [styles.shutter, pressed && styles.pressed, busy && styles.locked]}
        >
          <View style={styles.shutterCore} />
        </Pressable>

        <View style={styles.galleryButtonSpacer} />
      </View>

      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.centered, styles.busyOverlay]}>
          <ActivityIndicator color={colors.thriving} />
          <Text style={typography.label}>Holding still…</Text>
        </View>
      ) : null}
    </View>
  );
}

const SHUTTER_SIZE = 72;

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    minHeight: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  centered: { alignItems: 'center', justifyContent: 'center' },
  permission: { gap: spacing.sm, padding: spacing.xl },
  permissionCopy: { textAlign: 'center' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  galleryButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  galleryButtonSpacer: { width: 44 },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
    backgroundColor: colors.text,
  },
  pressed: { opacity: 0.7 },
  locked: { opacity: 0.4 },
  busyOverlay: { backgroundColor: colors.overlay, gap: spacing.sm },
});
