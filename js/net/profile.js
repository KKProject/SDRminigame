const PROFILE_STORAGE_KEY = 'huapai-player-profile';

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function randomSuffix() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function normalizeProfile(userInfo = {}) {
  return {
    nickName: cleanText(userInfo.nickName, 24),
    avatarUrl: cleanText(userInfo.avatarUrl, 500),
  };
}

export function extractProfile(result = {}) {
  const candidates = [
    result.userInfo,
    result.detail && result.detail.userInfo,
    result.profile,
    result,
  ];
  if (typeof result.rawData === 'string' && result.rawData) {
    try {
      candidates.push(JSON.parse(result.rawData));
    } catch (err) {
      // 忽略无法解析的兼容字段，继续尝试其他资料来源。
    }
  }
  for (const candidate of candidates) {
    const profile = normalizeProfile(candidate);
    if (profile.nickName || profile.avatarUrl) return profile;
  }
  return {};
}

export function readStoredProfile(runtime = wx) {
  if (!runtime || typeof runtime.getStorageSync !== 'function') return {};
  try {
    return normalizeProfile(runtime.getStorageSync(PROFILE_STORAGE_KEY) || {});
  } catch (err) {
    return {};
  }
}

export function saveProfile(profile, runtime = wx) {
  const normalized = normalizeProfile(profile);
  if (!runtime || typeof runtime.setStorageSync !== 'function') return normalized;
  try {
    runtime.setStorageSync(PROFILE_STORAGE_KEY, normalized);
  } catch (err) {
    // 本地缓存失败不应阻断在线登录。
  }
  return normalized;
}

export function profileWithFallback(profile = {}, runtime = wx) {
  const normalized = normalizeProfile(profile);
  const stored = readStoredProfile(runtime);
  const result = {
    nickName: normalized.nickName || stored.nickName,
    avatarUrl: normalized.avatarUrl || stored.avatarUrl,
  };
  if (!result.nickName) result.nickName = `玩家${randomSuffix()}`;
  return saveProfile(result, runtime);
}

function requestUserInfo(runtime = wx) {
  return new Promise((resolve) => {
    if (!runtime || typeof runtime.getUserInfo !== 'function') {
      resolve({});
      return;
    }
    runtime.getUserInfo({
      success(result = {}) {
        resolve(extractProfile(result));
      },
      fail(err) {
        console.warn('[profile] getUserInfo failed', err);
        resolve({});
      },
    });
  });
}

export function getAuthorizedProfile(runtime = wx) {
  return new Promise((resolve) => {
    if (
      !runtime
      || typeof runtime.getSetting !== 'function'
      || typeof runtime.getUserInfo !== 'function'
    ) {
      resolve(null);
      return;
    }
    runtime.getSetting({
      success(setting = {}) {
        if (!setting.authSetting || !setting.authSetting['scope.userInfo']) {
          resolve(null);
          return;
        }
        requestUserInfo(runtime).then((profile) => {
          if (!profile.nickName && !profile.avatarUrl) {
            resolve(null);
            wx.showToast({
              title: '没有获取到头像和昵称',
              duration: 0,
              icon: icon,
              image: 'image',
              mask: true,
              success: (res) => {},
              fail: (res) => {},
              complete: (res) => {},
            })
            return;
          }
          resolve(profileWithFallback(profile, runtime));
        });
      },
      fail() {
        resolve(null);
      },
    });
  });
}

export function createUserProfileButton(bounds, onProfile, runtime = wx) {
  if (!runtime || typeof runtime.createUserInfoButton !== 'function' || !bounds) return null;
  let button = null;
  try {
    button = runtime.createUserInfoButton({
      type: 'text',
      text: '在线对战',
      lang: 'zh_CN',
      withCredentials: true,
      style: {
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        lineHeight: bounds.h,
        backgroundColor: '#d92d20',
        color: '#ffffff',
        textAlign: 'center',
        fontSize: 28,
        borderRadius: 14,
      },
    });
  } catch (err) {
    console.warn('[profile] createUserInfoButton failed', err);
    return null;
  }
  if (!button || typeof button.onTap !== 'function') return null;
  button.onTap((result = {}) => {
    const callbackProfile = extractProfile(result);
    requestUserInfo(runtime).then((freshProfile) => {
      const profile = profileWithFallback({
        nickName: freshProfile.nickName || callbackProfile.nickName,
        avatarUrl: freshProfile.avatarUrl || callbackProfile.avatarUrl,
      }, runtime);
      console.info('[profile] authorization result', {
        errMsg: result.errMsg || '',
        nickName: profile.nickName,
        hasAvatar: Boolean(profile.avatarUrl),
        callbackHasProfile: Boolean(callbackProfile.nickName || callbackProfile.avatarUrl),
        refreshedHasProfile: Boolean(freshProfile.nickName || freshProfile.avatarUrl),
      });
      if (typeof onProfile === 'function') onProfile(profile);
    });
  });
  if (typeof button.show === 'function') {
    try {
      button.show();
    } catch (err) {
      console.warn('[profile] UserInfoButton.show failed', err);
      if (typeof button.destroy === 'function') button.destroy();
      return null;
    }
  }
  return button;
}
