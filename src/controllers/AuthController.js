import { Router } from 'express';
import AuthService from '../services/AuthService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { envConfig } from '../configs/env.config.js';
import { ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../configs/auth-cookies.config.js';

const router = Router();

const isProduction = envConfig.nodeEnv === 'production';

function baseCookieOptions(path = '/') {
  return {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path,
  };
}

function accessCookieOptions(expiresAt) {
  return {
    ...baseCookieOptions('/'),
    httpOnly: true,
    expires: new Date(expiresAt),
  };
}

function refreshCookieOptions(refreshExpiresAt) {
  return {
    ...baseCookieOptions('/api/auth'),
    httpOnly: true,
    expires: new Date(refreshExpiresAt),
  };
}

function csrfCookieOptions(expiresAt) {
  return {
    ...baseCookieOptions('/'),
    httpOnly: false,
    expires: new Date(expiresAt),
  };
}

function sendSession(res, status, session) {
  const { accessToken, token, refreshToken, refreshExpiresAt, csrfToken, ...data } = session;
  res.cookie(ACCESS_COOKIE_NAME, accessToken || token, accessCookieOptions(data.expiresAt));
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshExpiresAt));
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions(refreshExpiresAt));
  res.status(status).json({ ok: true, data });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  });
}

function clearAccessCookie(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE_NAME, {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}

router.post('/register', async (req, res, next) => {
  try {
    sendSession(res, 201, await AuthService.register(req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    sendSession(res, 200, await AuthService.login(req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    sendSession(res, 200, await AuthService.refresh(req.cookies?.[REFRESH_COOKIE_NAME]));
  } catch (e) {
    clearAccessCookie(res);
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const data = await AuthService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearAccessCookie(res);
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.status(200).json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => { try { res.status(200).json({ ok: true, data: await AuthService.me(req) }); } catch (e) { next(e); } });

router.post('/google', async (req, res, next) => {
  try {
    const { accessToken, rol, ...roleData } = req.body || {};
    sendSession(res, 200, await AuthService.loginWithGoogle(accessToken, rol, roleData));
  } catch (e) {
    next(e);
  }
});

router.get('/verify-email', async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.verifyEmail(req.query?.token) });
  } catch (e) {
    next(e);
  }
});

router.post('/resend-verification', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.resendVerification(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.requestPasswordReset(req.body) });
  } catch (e) {
    next(e);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.resetPassword(req.body) });
  } catch (e) {
    next(e);
  }
});

router.get('/tutor-account', authMiddleware, async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.getTutorAccount(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.patch('/tutor-account', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.updateTutorAccount(req.user.id, req.body) });
  } catch (e) {
    next(e);
  }
});

router.patch('/password', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.changePassword(req.user.id, req.body) });
  } catch (e) {
    next(e);
  }
});

router.patch('/email', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    res.status(200).json({ ok: true, data: await AuthService.changeEmail(req.user.id, req.body) });
  } catch (e) {
    next(e);
  }
});

export default router;
