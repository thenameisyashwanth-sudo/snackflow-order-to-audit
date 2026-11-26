import { UserRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  preferredLang: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferredLang: user.preferredLang,
    },
    env.jwtSecret,
    { expiresIn: '24h' }
  );
}

/**
 * Verifies Bearer JWT token and attaches `req.user`.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & {
      sub?: string;
      email?: string;
      name?: string;
      role?: UserRole;
      preferredLang?: string;
    };

    if (!payload.sub || !payload.email || !payload.role) {
      res.status(401).json({ error: 'Invalid authentication token payload.' });
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
      role: payload.role,
      preferredLang: payload.preferredLang ?? 'en',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/**
 * Enforces Section 3 Role-Based Access Control on Express route handlers.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied for role ${req.user.role}. Permitted roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
