import { Hono } from 'hono';

export const app = new Hono();

app.get('/', (c) => c.json({ message: 'Hello from Hono!' }));

app.get('/health', (c) => c.json({ status: 'ok' }));
