import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getCurrentUpdatePlatform,
  getInstallerFileName,
  resolveUpdateInfosUrl,
  resolveUpdateInstallerDownload,
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

describe("resolveUpdateInfosUrl", () => {
  test("通常時はビルド時に指定された更新情報 URL を返す", () => {
    expect(resolveUpdateInfosUrl("https://example.com/updateInfos.json")).toBe(
      "https://example.com/updateInfos.json",
    );
  });

  test("AIVISSPEECH_UPDATE_TEST_URL がある場合はテストサーバーの更新情報 URL を返す", () => {
    vi.stubEnv("AIVISSPEECH_UPDATE_TEST_URL", "http://127.0.0.1:18080");

    expect(resolveUpdateInfosUrl("https://example.com/updateInfos.json")).toBe(
      "http://127.0.0.1:18080/updateInfos.json",
    );
  });
});

describe("resolveUpdateInstallerDownload", () => {
  test("通常時は公式 GitHub Releases のインストーラー URL を返す", () => {
    expect(resolveUpdateInstallerDownload("macos-arm64", "1.2.3")).toEqual({
      fileName: "AivisSpeech-macOS-arm64-1.2.3.dmg",
      url: "https://github.com/Aivis-Project/AivisSpeech/releases/download/1.2.3/AivisSpeech-macOS-arm64-1.2.3.dmg",
    });
  });

  test("AIVISSPEECH_UPDATE_TEST_URL がある場合はテストサーバーのインストーラー URL を返す", () => {
    vi.stubEnv("AIVISSPEECH_UPDATE_TEST_URL", "http://127.0.0.1:18080");

    expect(resolveUpdateInstallerDownload("windows-x64", "9999.0.0")).toEqual({
      fileName: "AivisSpeech-Windows-x64-9999.0.0.exe",
      url: "http://127.0.0.1:18080/9999.0.0/AivisSpeech-Windows-x64-9999.0.0.exe",
    });
  });
});
