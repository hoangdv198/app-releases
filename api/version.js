// Vercel Serverless Function: GET /api/version?app=vnsmartcall
const GITHUB_REPO = "hoangdv198/app-releases";

const APP_CONFIGS = {
  vnsmartcall: {
    slug: "vnsmartcall",
    name: "VNSmartCall",
    tagPrefix: "vnsmartcall-",
    pageUrl: "https://app-releases.vercel.app/vnsmartcall"
  },
  mydts: {
    slug: "mydts",
    name: "myDTS",
    tagPrefix: "mydts-",
    pageUrl: "https://app-releases.vercel.app/mydts"
  },
  poscake: {
    slug: "poscake",
    name: "Poscake Tools",
    tagPrefix: "poscake-",
    pageUrl: "https://app-releases.vercel.app/poscake"
  }
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { app } = req.query;

  if (!app) {
    return res.status(400).json({
      success: false,
      message: "Thiếu tham số 'app'. Ví dụ: /api/version?app=vnsmartcall hoặc ?app=mydts"
    });
  }

  const appKey = String(app).toLowerCase().trim();
  const conf = APP_CONFIGS[appKey] || {
    slug: appKey,
    name: appKey.toUpperCase(),
    tagPrefix: `${appKey}-`,
    pageUrl: `https://app-releases.vercel.app/${appKey}`
  };

  try {
    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "AppReleases-API"
    };

    const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, { headers });
    if (!ghResp.ok) {
      throw new Error(`GitHub API error: ${ghResp.statusText}`);
    }

    const releases = await ghResp.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản phát hành nào trong hệ thống."
      });
    }

    // Tìm release mới nhất cho app
    const appReleases = releases.filter(r => {
      const tag = (r.tag_name || "").toLowerCase();
      const title = (r.name || "").toLowerCase();
      return tag.startsWith(conf.tagPrefix.toLowerCase()) || title.includes(conf.name.toLowerCase());
    });

    if (appReleases.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Chưa có bản phát hành nào cho app: ${conf.name}`
      });
    }

    const latest = appReleases[0];
    const apkAsset = (latest.assets || []).find(a => (a.name || "").toLowerCase().endsWith(".apk"));

    // Tách version từ tag_name hoặc name (vd: vnsmartcall-v1.0.6 -> 1.0.6)
    let versionStr = "1.0.0";
    const verMatch = (latest.tag_name || "").match(/\d+(\.\d+)+/);
    if (verMatch) {
      versionStr = verMatch[0];
    } else {
      const nameMatch = (latest.name || "").match(/\d+(\.\d+)+/);
      if (nameMatch) versionStr = nameMatch[0];
    }

    // Tạo versionCode số nguyên từ version (vd: 1.0.6 -> 106 hoặc 10006)
    const parts = versionStr.split(".").map(Number);
    const versionCode = (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);

    const sizeMb = apkAsset ? (apkAsset.size / (1024 * 1024)).toFixed(1) + " MB" : null;

    return res.status(200).json({
      success: true,
      app: conf.slug,
      appName: conf.name,
      latestVersion: versionStr,
      versionCode: versionCode,
      tagName: latest.tag_name,
      releaseName: latest.name,
      changelog: latest.body || "",
      publishedAt: latest.published_at,
      apk: {
        fileName: apkAsset ? apkAsset.name : null,
        fileSize: sizeMb,
        downloadUrl: apkAsset ? apkAsset.browser_download_url : null
      },
      downloadPageUrl: conf.pageUrl,
      // Danh sách lịch sử các phiên bản cũ để app tham khảo nếu cần
      history: appReleases.slice(1, 6).map(r => ({
        tag: r.tag_name,
        name: r.name,
        publishedAt: r.published_at
      }))
    });

  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy metadata: " + error.message
    });
  }
}
