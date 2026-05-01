import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getCurrentUpdatePlatform,
  getInstallerFileName,
} from "@/domain/updateDownload";

const originalPlatform = process.platform;
const originalArch = process.arch;

const setProcessPlatform = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
) => {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  Object.defineProperty(process, "arch", {
    value: arch,
    configurable: true,
  });
};

afterEach(() => {
  setProcessPlatform(originalPlatform, originalArch);
  vi.unstubAllEnvs();
});

describe("getInstallerFileName", () => {
  test("Windows x64 用インストーラーのファイル名を生成できる", () => {
    expect(getInstallerFileName("windows-x64", "1.2.3")).toBe(
      "AivisSpeech-Windows-x64-1.2.3.exe",
    );
  });

  test("macOS x64 用インストーラーのファイル名を生成できる", () => {
    expect(getInstallerFileName("macos-x64", "1.2.3")).toBe(
      "AivisSpeech-macOS-x64-1.2.3.dmg",
    );
  });

  test("macOS arm64 用インストーラーのファイル名を生成できる", () => {
    expect(getInstallerFileName("macos-arm64", "1.2.3")).toBe(
      "AivisSpeech-macOS-arm64-1.2.3.dmg",
    );
  });
});

describe("getCurrentUpdatePlatform", () => {
  test("Windows x64 を判定できる", () => {
    setProcessPlatform("win32", "x64");

    expect(getCurrentUpdatePlatform()).toBe("windows-x64");
  });

  test("macOS x64 を判定できる", () => {
    setProcessPlatform("darwin", "x64");

    expect(getCurrentUpdatePlatform()).toBe("macos-x64");
  });

  test("macOS arm64 を判定できる", () => {
    setProcessPlatform("darwin", "arm64");

    expect(getCurrentUpdatePlatform()).toBe("macos-arm64");
  });

  test("未対応プラットフォームでは null を返す", () => {
    setProcessPlatform("linux", "x64");

    expect(getCurrentUpdatePlatform()).toBeNull();
  });
});

