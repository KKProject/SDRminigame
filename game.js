import { reportClientDiagnostic, flushClientDiagnostics } from './js/net/diagnostics';
import Main from './js/main';

if (typeof wx !== 'undefined' && wx.onError) {
  wx.onError((error) => {
    reportClientDiagnostic('uncaught-error', { message: String(error) });
    flushClientDiagnostics();
  });
}

new Main();
