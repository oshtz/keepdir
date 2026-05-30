import { getPathBreadcrumbs } from "../pathBreadcrumbs";

describe("getPathBreadcrumbs", () => {
  it("builds absolute Windows drive breadcrumbs", () => {
    expect(getPathBreadcrumbs("E:\\DEVbackup\\KeepDir")).toEqual([
      { label: "E:", path: "E:/" },
      { label: "DEVbackup", path: "E:/DEVbackup" },
      { label: "KeepDir", path: "E:/DEVbackup/KeepDir" },
    ]);
  });

  it("builds POSIX root breadcrumbs", () => {
    expect(getPathBreadcrumbs("/Users/ada/Documents")).toEqual([
      { label: "Root", path: "/" },
      { label: "Users", path: "/Users" },
      { label: "ada", path: "/Users/ada" },
      { label: "Documents", path: "/Users/ada/Documents" },
    ]);
  });

  it("builds UNC share breadcrumbs", () => {
    expect(getPathBreadcrumbs("\\\\server\\share\\folder")).toEqual([
      { label: "server/share", path: "//server/share" },
      { label: "folder", path: "//server/share/folder" },
    ]);
  });
});
