import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authenticate, requireRole, signAuthToken } from '../middleware/auth.js';

function createMockRes() {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(payload: unknown) {
      this.body = payload;
      return this as Response;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe('JWT Auth & RBAC Middleware', () => {
  it('signs and verifies JWT token and attaches req.user', () => {
    const token = signAuthToken({
      id: 'user-1',
      email: 'salesman_a@factory.in',
      name: 'Salesman A',
      role: 'SALESMAN',
      preferredLang: 'en',
    });

    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe('SALESMAN');
    expect(req.user?.email).toBe('salesman_a@factory.in');
  });

  it('rejects missing or invalid Bearer tokens with 401', () => {
    const req = { headers: {} } as Request;
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('enforces requireRole permissions (403 on unauthorized role)', () => {
    const middleware = requireRole('ADMIN', 'OWNER');
    const next = vi.fn();

    const deniedReq = {
      user: {
        id: 'u-sales',
        email: 'salesman_a@factory.in',
        name: 'Salesman A',
        role: 'SALESMAN',
        preferredLang: 'en',
      },
    } as Request;
    const deniedRes = createMockRes();
    middleware(deniedReq, deniedRes, next);
    expect(next).not.toHaveBeenCalled();
    expect(deniedRes.statusCode).toBe(403);

    const allowedReq = {
      user: {
        id: 'u-admin',
        email: 'admin@factory.in',
        name: 'Factory Admin',
        role: 'ADMIN',
        preferredLang: 'en',
      },
    } as Request;
    const allowedRes = createMockRes();
    middleware(allowedReq, allowedRes, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
