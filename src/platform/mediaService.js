// src/platform/mediaService.js
// Shared media/file boundary for AeroStation Hub.
//
// Website/PWA:
//   Existing <input type="file">, browser downloads and print flows remain unchanged.
//
// iOS/Android:
//   This service exposes native Camera, Photos, Filesystem and Share capabilities.
//   Operational pages will be migrated to these helpers gradually in later batches.

import {
  Camera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import {
  Directory,
  Filesystem,
} from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeApp } from "./platform.js";

export function shouldUseNativeMedia() {
  return isNativeApp();
}

export async function getNativePhotoPermissionStatus() {
  if (!isNativeApp()) {
    return {
      camera: "unsupported",
      photos: "unsupported",
    };
  }

  return Camera.checkPermissions();
}

export async function requestNativePhotoPermissions() {
  if (!isNativeApp()) {
    return {
      camera: "unsupported",
      photos: "unsupported",
    };
  }

  return Camera.requestPermissions({
    permissions: ["camera", "photos"],
  });
}

async function ensureNativePhotoPermission() {
  var permission = await Camera.checkPermissions();

  if (
    permission.camera === "prompt" ||
    permission.photos === "prompt"
  ) {
    permission = await Camera.requestPermissions({
      permissions: ["camera", "photos"],
    });
  }

  return permission;
}

export async function takeNativePhoto(options) {
  if (!isNativeApp()) {
    throw new Error(
      "Native camera is only available inside the AeroStation Hub mobile app."
    );
  }

  var permission = await ensureNativePhotoPermission();

  if (permission.camera !== "granted") {
    throw new Error("Camera permission was not granted.");
  }

  options = options || {};

  return Camera.getPhoto({
    quality:
      typeof options.quality === "number"
        ? options.quality
        : 82,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });
}

export async function pickNativePhoto(options) {
  if (!isNativeApp()) {
    throw new Error(
      "Native photo picker is only available inside the AeroStation Hub mobile app."
    );
  }

  var permission = await ensureNativePhotoPermission();

  if (
    permission.photos !== "granted" &&
    permission.photos !== "limited"
  ) {
    throw new Error("Photo library permission was not granted.");
  }

  options = options || {};

  return Camera.getPhoto({
    quality:
      typeof options.quality === "number"
        ? options.quality
        : 82,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos,
    correctOrientation: true,
  });
}

export async function pickNativeImages(options) {
  if (!isNativeApp()) {
    throw new Error(
      "Native photo picker is only available inside the AeroStation Hub mobile app."
    );
  }

  options = options || {};

  return Camera.pickImages({
    quality:
      typeof options.quality === "number"
        ? options.quality
        : 82,
    limit:
      typeof options.limit === "number"
        ? options.limit
        : 0,
  });
}

export async function nativePhotoToBlob(photo) {
  if (!photo || !photo.webPath) {
    throw new Error("The selected photo does not include a readable webPath.");
  }

  var response = await fetch(photo.webPath);

  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }

  return response.blob();
}

export async function writeNativeBase64File(options) {
  if (!isNativeApp()) {
    throw new Error(
      "Native file writing is only available inside the AeroStation Hub mobile app."
    );
  }

  options = options || {};

  if (!options.path) {
    throw new Error("A file path is required.");
  }

  if (!options.data) {
    throw new Error("Base64 file data is required.");
  }

  return Filesystem.writeFile({
    path: options.path,
    data: options.data,
    directory: Directory.Cache,
    recursive: true,
  });
}

export async function shareNativeFile(options) {
  options = options || {};

  if (!isNativeApp()) {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      return navigator.share({
        title: options.title || "AeroStation Hub",
        text: options.text || "",
        url: options.url || "",
      });
    }

    throw new Error(
      "Native sharing is not available in this browser."
    );
  }

  var shareOptions = {
    title: options.title || "AeroStation Hub",
    text: options.text || "",
    dialogTitle:
      options.dialogTitle || "Share from AeroStation Hub",
  };

  if (Array.isArray(options.files) && options.files.length) {
    shareOptions.files = options.files;
  } else if (options.url) {
    shareOptions.url = options.url;
  }

  return Share.share(shareOptions);
}

export async function canShareFiles() {
  if (!isNativeApp()) {
    return Boolean(
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    );
  }

  try {
    var result = await Share.canShare();
    return Boolean(result && result.value);
  } catch {
    return false;
  }
}
