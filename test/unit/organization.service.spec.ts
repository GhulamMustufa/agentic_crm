import { describe, it, expect, beforeEach } from 'vitest';

import { AppConfigService } from '@/core/config/config.service';
import { EmailService } from '@/core/email/email.service';
import { ConflictError, AuthorizationError, ValidationError } from '@/core/errors/app-error';
import { InMemoryUserRepository } from '@/modules/identity/repositories/in-memory-user.repository';
import { InMemoryTenantRepository } from '@/modules/organization/repositories/in-memory-tenant.repository';
import { OrganizationService } from '@/modules/organization/services/organization.service';

describe('OrganizationService', () => {
  let orgService: OrganizationService;
  let tenantRepo: InMemoryTenantRepository;
  let userRepo: InMemoryUserRepository;
  let emailService: EmailService;
  let config: AppConfigService;
  let userId: string;

  beforeEach(async () => {
    config = new AppConfigService({
      FRONTEND_URL: 'http://localhost:3000',
    });
    emailService = new EmailService(config);
    tenantRepo = new InMemoryTenantRepository();
    userRepo = new InMemoryUserRepository();
    orgService = new OrganizationService(tenantRepo, userRepo, emailService, config);

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

  it('should allow OWNER to invite a new member with BOOKKEEPER role and dispatch email', async () => {
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
    expect(inviteResult.invitationId).toBeDefined();
    expect(inviteResult.expiresAt).toBeInstanceOf(Date);
    expect(inviteResult.debugInviteUrl).toContain('/invite?token=');

    // Email dispatch verification
    expect(emailService.lastSentInviteUrl).toBe(inviteResult.debugInviteUrl);

    // Should appear in pending invitations
    const pending = await orgService.listPendingInvitations(tenant.id, userId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.email).toBe('elena@bookkeeper.com');
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

  it('should prevent inviting a user who is already an active member', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Corp',
      slug: 'acme-corp',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    await expect(
      orgService.inviteMember(tenant.id, userId, {
        email: 'alex@example.com',
        roleCode: 'CONTROLLER',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should allow OWNER to revoke a pending invitation', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Corp',
      slug: 'acme-corp',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    const inviteResult = await orgService.inviteMember(tenant.id, userId, {
      email: 'revoke.me@example.com',
      roleCode: 'AUDITOR',
    });

    const revokeResult = await orgService.revokeInvitation(
      tenant.id,
      userId,
      inviteResult.invitationId,
    );
    expect(revokeResult.success).toBe(true);

    const pending = await orgService.listPendingInvitations(tenant.id, userId);
    expect(pending).toHaveLength(0);
  });

  it('should list all active members of the organization', async () => {
    const tenant = await orgService.createOrganization(userId, {
      legalName: 'Acme Corp',
      slug: 'acme-corp',
      baseCurrency: 'USD',
      timezone: 'UTC',
    });

    const auditor = await userRepo.create({
      email: 'auditor@example.com',
      passwordHash: 'hash',
      fullName: 'Auditor User',
      isSuperadmin: false,
      status: 'ACTIVE',
    });

    await tenantRepo.createMembership({
      tenantId: tenant.id,
      userId: auditor.id,
      roleCode: 'AUDITOR',
      status: 'ACTIVE',
    });

    const members = await orgService.getMembers(tenant.id, userId);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.roleCode)).toContain('OWNER');
    expect(members.map((m) => m.roleCode)).toContain('AUDITOR');
  });
});
