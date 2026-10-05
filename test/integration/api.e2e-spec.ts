import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { INestApplication } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { GlobalExceptionFilter } from '@/core/errors/global-exception.filter';

describe('End-to-End API Test Suite (Phase 0)', () => {
  let app: INestApplication;
  let userToken: string;
  let userId: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. POST /api/v1/auth/register -> should register new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'alex.founder@company.com',
        password: 'Password123!',
        fullName: 'Alex Founder',
      })
      .expect(201);

    expect(res.body.data.user.email).toBe('alex.founder@company.com');
    expect(res.body.data.tokens.accessToken).toBeDefined();
    userToken = res.body.data.tokens.accessToken;
    userId = res.body.data.user.id;
  });

  it('2. POST /api/v1/auth/login -> should authenticate user and return JWT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'alex.founder@company.com',
        password: 'Password123!',
      })
      .expect(200);

    expect(res.body.data.tokens.accessToken).toBeDefined();
    userToken = res.body.data.tokens.accessToken;
  });

  it('3. GET /api/v1/auth/me -> should return profile with Bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(userId);
    expect(res.body.data.email).toBe('alex.founder@company.com');
  });

  it('4. POST /api/v1/organizations -> should create organization and assign user as OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        legalName: 'Alpha Innovations Corp.',
        slug: 'alpha-innovations',
        baseCurrency: 'USD',
        timezone: 'America/New_York',
      })
      .expect(201);

    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.slug).toBe('alpha-innovations');
    tenantId = res.body.data.id;
  });

  it('5. GET /api/v1/organizations -> should list user organizations', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].slug).toBe('alpha-innovations');
  });

  it('6. POST /api/v1/organizations/:id/members -> OWNER can invite team member', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${tenantId}/members`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        email: 'elena.controller@company.com',
        roleCode: 'CONTROLLER',
      })
      .expect(201);

    expect(res.body.data.email).toBe('elena.controller@company.com');
    expect(res.body.data.roleCode).toBe('CONTROLLER');
  });

  it('7. GET /api/v1/organizations/:id -> should reject user not belonging to organization with 403', async () => {
    // Register separate outsider user
    const outsiderRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'outsider@other.com',
        password: 'Password123!',
        fullName: 'Outsider User',
      })
      .expect(201);

    const outsiderToken = outsiderRes.body.data.tokens.accessToken;

    // Outsider attempts to access Alex's tenant
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${tenantId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});
