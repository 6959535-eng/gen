/**
 * Платформні реалізації для backupCore: файли у внутрішній памʼяті додатка,
 * Android Keystore / iOS Keychain, системне меню «Поділитися», вибір файла.
 * У веб-перегляді (лише розробка) — прості замінники.
 */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { FileStore, SecretStore } from './backupCore';

const isWeb = Platform.OS === 'web';
const MIME = 'application/octet-stream';

export const appVersion: string =
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';

// ---------- Файли ----------

const webFiles = new Map<string, Uint8Array>();

function fileAt(path: string): File {
  const parts = path.split('/');
  const name = parts.pop()!;
  const dir = new Directory(Paths.document, ...parts);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
}

export const files: FileStore = isWeb
  ? {
      list: async (dir) => [...webFiles.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)),
      read: async (p) => webFiles.get(p) ?? new Uint8Array(),
      write: async (p, d) => void webFiles.set(p, d),
      remove: async (p) => void webFiles.delete(p),
    }
  : {
      async list(dir) {
        const d = new Directory(Paths.document, dir);
        if (!d.exists) return [];
        return d.list().filter((x): x is File => x instanceof File).map((f) => f.name);
      },
      read: async (p) => fileAt(p).bytes(),
      async write(p, data) {
        const f = fileAt(p);
        if (f.exists) f.delete();
        f.create();
        f.write(data);
      },
      async remove(p) {
        const f = fileAt(p);
        if (f.exists) f.delete();
      },
    };

// ---------- Захищене сховище ----------

export const secrets: SecretStore = isWeb
  ? {
      get: async (k) => globalThis.localStorage?.getItem(`gen.${k}`) ?? null,
      set: async (k, v) => globalThis.localStorage?.setItem(`gen.${k}`, v),
      remove: async (k) => globalThis.localStorage?.removeItem(`gen.${k}`),
    }
  : {
      get: (k) => SecureStore.getItemAsync(k),
      set: (k, v) => SecureStore.setItemAsync(k, v),
      remove: (k) => SecureStore.deleteItemAsync(k),
    };

// ---------- Поширення й збереження ----------

function webDownload(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: MIME });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

/** Системне меню «Поділитися» (Telegram, Signal, пошта, «Зберегти у Файли»…). */
export async function shareFile(bytes: Uint8Array, name: string): Promise<void> {
  if (isWeb) return webDownload(bytes, name);
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
  await Sharing.shareAsync(f.uri, { mimeType: MIME, dialogTitle: 'Надіслати файл', UTI: 'public.data' });
}

/** Android: користувач обирає папку (напр., «Завантаження»), файл записується туди. */
export const canSaveToFolder = Platform.OS === 'android';
export async function saveToFolder(bytes: Uint8Array, name: string): Promise<boolean> {
  if (isWeb) {
    webDownload(bytes, name);
    return true;
  }
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // користувач скасував
  }
  const f = dir.createFile(name, MIME);
  f.write(bytes);
  return true;
}

// ---------- Відкриття файлів ----------

/** Вибір файла .gen через системний діалог. null — скасовано. */
export async function pickGenFile(): Promise<{ bytes: Uint8Array; name: string } | null> {
  if (isWeb) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gen';
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name } : null);
      };
      input.click();
    });
  }
  const res = await File.pickFileAsync({});
  if (res.canceled || !res.result) return null;
  return { bytes: await res.result.bytes(), name: res.result.name };
}

/** Читання файла, переданого через «Відкрити за допомогою» (content:// або file://). */
export async function readUri(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
