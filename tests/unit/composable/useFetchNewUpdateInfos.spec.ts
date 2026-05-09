import { vi, it, expect } from "vitest";
import { Ref } from "vue";
import { UpdateInfo, UrlString } from "@/type/preload";
import { useFetchNewUpdateInfos } from "@/composables/useFetchNewUpdateInfos";

// 最新バージョンの情報をfetchするモックを作成する
const setupFetchMock = (latestVersion: string) => {
  // fetchのモックを作成
  const updateInfos: UpdateInfo[] = [
    {
      version: latestVersion,
      descriptions: [],
      contributors: [],
    },
  ];
  vi.stubGlobal("fetch", async () => {
    return new Response(JSON.stringify(updateInfos), { status: 200 });
  });
};

// 準備完了まで待機
const waitFinished = async (result: Ref<{ status: string }>) => {
  await vi.waitFor(() => {
    if (result.value.status === "updateChecking") throw new Error();
  });
};

it("新バージョンがある場合、latestVersionに最新バージョンが代入される", async () => {
  const currentVersion = "1.0.0";
  const latestVersion = "2.0.0";
  setupFetchMock(latestVersion);

  const result = useFetchNewUpdateInfos(
    async () => currentVersion,
    UrlString("http://example.com"),
  );

  await waitFinished(result);
  expect(result.value).toMatchObject({
    status: "updateAvailable",
    latestVersion,
  });
});

it("新バージョンがない場合は状態が変わるだけ", async () => {
  const currentVersion = "1.0.0";
  const latestVersion = "1.0.0";
  setupFetchMock(latestVersion);

  const result = useFetchNewUpdateInfos(
    async () => currentVersion,
    UrlString("http://example.com"),
  );

  await waitFinished(result);
  expect(result.value).toMatchObject({ status: "updateNotAvailable" });
});

it("更新情報 URL の取得に失敗した場合は更新なしとして扱う", async () => {
  const currentVersion = "1.0.0";
  const fetchMock = vi.fn();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetchMock);

  const result = useFetchNewUpdateInfos(
    async () => currentVersion,
    async () => {
      throw new Error("Failed to resolve update infos URL.");
    },
  );

  await waitFinished(result);
  expect(result.value).toMatchObject({ status: "updateNotAvailable" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalled();
  warnSpy.mockRestore();
});
