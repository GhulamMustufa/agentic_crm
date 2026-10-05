import { describe, it, expect, beforeEach } from 'vitest';

import { ConflictError, AuthorizationError, ValidationError } from '@/core/errors/app-error';
import { InMemoryUserRepository } from '@/modules/identity/repositories/in-memory-user.repository';
import { InMemoryTenantRepository } from '@/modules/organization/repositories/in-memory-tenant.repository';
import { OrganizationService } from '@/modules/organization/services/organization.service';

describe('OrganizationService', () => {
  let orgService: OrganizationService;
  let tenantRepo: InMemoryTenantRepository;
  let userRepo: InMemoryUserRepository;
  let userId: string;

  beforeEach(async () => {
    tenantRepo = new InMemoryTenantRepository();
    userRepo = new InMemoryUserRepository();
    orgService = new OrganizationService(tenantRepo, userRepo);

    const user = await userRepo.create({
      email: 'alex@example.com',
      passwordHash: 'hash',
      fullName: 'Alex Founder',
      isSuperadmin: false,
      status: 'ACTIVE',
    });
    userId = user.id;
  });

  it('should create an organization, assign creator as OWNER, and initialize settings', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Technologies Inc.',
      slug: 'acme-tech',
      baseCurrency: 'USD',
      timezone: 'America/New_York',
    });

    expect(tenant.id).toBeDefined();
    expect(tenant.slug).toBe('acme-tech');
    expect(tenant.baseCurrency).toBe('USD');

    // Verify membership
    const membership = await tenantRepo.findMembership(tenant.id, userId);
    expect(membership).toBeDefined();
    expect(membership?.roleCode).toBe('OWNER');

    // Verify settings initialized
    const settings = await orgService.getSettings(tenant.id);
    expect(settings.autoPostMinConfidence).toBe(0.95);
    expect(settings.allowAiAutoPosting).toBe(true);
  });

  it('should reject duplicate organization slug', async () => {
    await orgService.createOrganization(userId, {
      legalName: 'Acme Technologies Inc.',
      slug: 'acme-tech',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    await expect(
      orgService.createOrganization(userId, {
        legalName: 'Another Acme',
        slug: 'acme-tech',
        baseCurrency: 'USD',
        timezone: 'UTC',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should reject malformed slug', async () => {
    await expect(
      orgService.createOrganization(userId, {
        legalName: 'Acme',
        slug: 'INVALID SLUG!',
        baseCurrency: 'USD',
        timezone: 'UTC',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should allow OWNER to invite a new member with BOOKKEEPER role', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Corp',
      slug: 'acme-corp',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    const inviteResult = await orgService.inviteMember(tenant.id, userId, {
      email: 'elena@bookkeeper.com',
      roleCode: 'BOOKKEEPER',
    });

    expect(inviteResult.email).toBe('elena@bookkeeper.com');
    expect(inviteResult.roleCode).toBe('BOOKKEEPER');

    // Member user should now exist
    const invitedUser = await userRepo.findByEmail('elena@bookkeeper.com');
    expect(invitedUser).toBeDefined();
  });

  it('should prevent non-owner/controller from inviting members', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Corp',
      slug: 'acme-corp',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    // Create a bookkeeper user
    const bookkeeper = await userRepo.create({
      email: 'bookkeeper@example.com',
      passwordHash: 'hash',
      fullName: 'Regular Bookkeeper',
      isSuperadmin: false,
      status: 'ACTIVE',
    });

    await tenantRepo.createMembership({
      tenantId: tenant.id,
      userId: bookkeeper.id,
      roleCode: 'BOOKKEEPER',
      status: 'ACTIVE',
    });

    await expect(
      orgService.inviteMember(tenant.id, bookkeeper.id, {
        email: 'hacker@example.com',
        roleCode: 'CONTROLLER',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
