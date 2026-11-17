export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  contentType: string;
  updatedAt: string;
}

export interface LatestReleaseInfo {
  version: string;
  name: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  installerUrl: string;
  installerName: string;
  installerSize: number;
  assets: ReleaseAsset[];
  zipUrl: string;
  tarUrl: string;
}

const GITHUB_OWNER = 'jomo424947-arch';
const GITHUB_REPO = 'cyber-project';
const CACHE_KEY = 'ccms_github_latest_release_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

const FALLBACK_RELEASE: LatestReleaseInfo = {
  version: 'v2.0.0',
  name: 'CCMS v2.0.0 — CyberShield Device Control Edition',
  publishedAt: new Date().toISOString(),
  body: 'محرك التحكم وإنفاذ قفل الشاشات للأجهزة (Ed25519)، المزامنة السحابية الفورية مع Supabase، وتحديث الهوية البصرية الجديدة.',
  htmlUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
  installerUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v2.0.0/CCMS-Setup-2.0.0.exe`,
  installerName: 'CCMS-Setup-2.0.0.exe',
  installerSize: 88 * 1024 * 1024,
  assets: [
    {
      id: 1,
      name: 'CCMS-Setup-2.0.0.exe',
      size: 88 * 1024 * 1024,
      downloadCount: 0,
      downloadUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v2.0.0/CCMS-Setup-2.0.0.exe`,
      contentType: 'application/octet-stream',
      updatedAt: new Date().toISOString(),
    },
  ],
  zipUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/v2.0.0.zip`,
  tarUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/v2.0.0.tar.gz`,
};

export async function fetchLatestRelease(): Promise<LatestReleaseInfo> {
  // Check memory / local cache first
  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const data = await res.json();

    const assets: ReleaseAsset[] = (data.assets || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
      contentType: a.content_type,
      updatedAt: a.updated_at,
    }));

    // Find Windows installer .exe
    const exeAsset = assets.find((a) => a.name.toLowerCase().endsWith('.exe'));

    const installerUrl = exeAsset
      ? exeAsset.downloadUrl
      : `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${data.tag_name}/CCMS-Setup-${data.tag_name.replace(/^v/, '')}.exe`;

    const installerName = exeAsset ? exeAsset.name : `CCMS-Setup-${data.tag_name.replace(/^v/, '')}.exe`;
    const installerSize = exeAsset ? exeAsset.size : 85 * 1024 * 1024;

    const releaseInfo: LatestReleaseInfo = {
      version: data.tag_name || 'v1.4.6',
      name: data.name || `CCMS ${data.tag_name}`,
      publishedAt: data.published_at || new Date().toISOString(),
      body: data.body || '',
      htmlUrl: data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      installerUrl,
      installerName,
      installerSize,
      assets,
      zipUrl: data.zipball_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${data.tag_name}.zip`,
      tarUrl: data.tarball_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${data.tag_name}.tar.gz`,
    };

    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data: releaseInfo,
        })
      );
    } catch {
      // Ignore cache write errors
    }

    return releaseInfo;
  } catch (err) {
    console.warn('[githubReleaseService] Error fetching latest release from GitHub API, using fallback:', err);
    return FALLBACK_RELEASE;
  }
}

