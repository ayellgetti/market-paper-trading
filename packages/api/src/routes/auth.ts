import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashed,
        name: body.name,
        paperAccounts: {
          create: {
            name: 'Default',
            startingBalance: 1000000,
            currentBalance: 1000000,
            riskPercent: 2,
            rewardRatio: 1.5,
          },
        },
      },
      include: { paperAccounts: true },
    });

    const token = app.jwt.sign({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name }, account: user.paperAccounts[0] };
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { paperAccounts: true },
    });

    if (!user || !(await bcrypt.compare(body.password, user.password))) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name }, account: user.paperAccounts[0] };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user as { userId: string };
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { paperAccounts: true },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      accounts: user.paperAccounts,
    };
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}
