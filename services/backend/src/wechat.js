async function exchangeCodeForSession(code, config = {}, fetchImpl = globalThis.fetch) {
  if (config.devOpenid) {
    return { openid: config.devOpenid, session_key: 'dev-session-key' };
  }
  if (!code) {
    const error = new Error('WECHAT_CODE_REQUIRED');
    error.code = 'WECHAT_CODE_REQUIRED';
    throw error;
  }
  if (!config.wechatAppid || !config.wechatSecret) {
    const error = new Error('WECHAT_CONFIG_MISSING');
    error.code = 'WECHAT_CONFIG_MISSING';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    const error = new Error('FETCH_UNSUPPORTED');
    error.code = 'FETCH_UNSUPPORTED';
    throw error;
  }
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.wechatAppid);
  url.searchParams.set('secret', config.wechatSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const res = await fetchImpl(url);
  const data = await res.json();
  if (!res.ok || data.errcode || !data.openid) {
    const error = new Error(data.errmsg || `WECHAT_SESSION_FAILED_${res.status}`);
    error.code = 'WECHAT_SESSION_FAILED';
    error.detail = data;
    throw error;
  }
  return data;
}

module.exports = {
  exchangeCodeForSession,
};
