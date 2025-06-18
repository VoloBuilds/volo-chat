import { MiddlewareHandler } from 'hono';
import { verifyFirebaseToken } from '../lib/firebase-auth';
import { getDatabase } from '../lib/db-cloudflare';
import { eq } from 'drizzle-orm';
import { User, users } from '../schema/users';
import { getFirebaseProjectId } from '../lib/env';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.split('Bearer ')[1];
    const firebaseProjectId = getFirebaseProjectId();
    const firebaseUser = await verifyFirebaseToken(token, firebaseProjectId);

    const db = await getDatabase();

    // Handle anonymous users (email might be null)
    const userEmail = firebaseUser.email || null;
    const isAnonymous = !firebaseUser.email;

    // Upsert: insert if not exists, do nothing if exists
    // For anonymous users, email will be null
    await db.insert(users)
      .values({
        id: firebaseUser.id,
        email: userEmail,
        display_name: null,
        photo_url: null,
        isAnonymous: isAnonymous,
      })
      .onConflictDoNothing();

    // Get the user (either just created or already existing)
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, firebaseUser.id))
      .limit(1);

    if (!user) {
      throw new Error('Failed to create or retrieve user');
    }

    c.set('user', user);
    await next();
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Unauthorized' }, 401);
  }
}; 