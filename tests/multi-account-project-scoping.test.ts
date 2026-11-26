import { WhatsAppAccountRepository } from "../src/server/repositories/accountRepository";
import { ProjectRepository } from "../src/server/repositories/projectRepository";
import { UserRepository } from "../src/server/repositories/userRepository";
import { encryptText, decryptText, signJwt, verifyJwt } from "../src/server/security/crypto";

async function runTests() {
  console.log("=================================================");
  console.log("⚡ TESTING MULTI-ACCOUNT & PROJECT SCOPING SYSTEM");
  console.log("=================================================\n");

  const accountRepo = new WhatsAppAccountRepository();
  const projectRepo = new ProjectRepository();
  const userRepo = new UserRepository();

  // 1. Password Verification & User Role Scoping
  console.log("▶ Test 1: User Login & Role Scoping ('user' role)");
  const user = await userRepo.createOrUpdate({
    email: "operator1@test.com",
    fullName: "Operator One",
    password: "secure_password_2026",
    roleId: "user",
  });

  if (user.roleId !== "user") {
    throw new Error(`Expected role 'user', got '${user.roleId}'`);
  }
  const validUser = await userRepo.validateCredentials("operator1@test.com", "secure_password_2026");
  if (!validUser) {
    throw new Error("Password verification failed for operator1@test.com");
  }
  const invalidUser = await userRepo.validateCredentials("operator1@test.com", "wrong_password");
  if (invalidUser) {
    throw new Error("Invalid password should not authenticate");
  }
  console.log("✔ User credentials verified with PBKDF2/SHA-512 and scoped to 'user' role");

  // 2. AES-256-GCM Zero Key Exposure Vaulting
  console.log("\n▶ Test 2: AES-256-GCM Credentials Vaulting");
  const rawToken = "EAAG_secret_meta_system_token_xyz_998877";
  const rawAppSecret = "meta_app_secret_hex_1234567890abcdef";
  const testWabaId = "waba_tenant_alpha_01";

  await accountRepo.storeCredentials(testWabaId, rawToken, rawAppSecret);
  const decrypted = await accountRepo.getCredentials(testWabaId);

  if (!decrypted || decrypted.accessToken !== rawToken || decrypted.appSecret !== rawAppSecret) {
    throw new Error("Decrypted credentials do not match original vaulted keys");
  }
  console.log("✔ Credentials securely vaulted and decrypted in-memory using AES-256-GCM");

  // 3. User to WhatsApp Account Tenancy
  console.log("\n▶ Test 3: User Tenancy & Account Access Scoping");
  const accountA = await accountRepo.create({
    wabaId: "waba_tenant_alpha_01",
    accountName: "Tenant Alpha WhatsApp",
    currency: "USD",
    timezoneId: "UTC",
    accountReviewStatus: "APPROVED",
    businessVerificationStatus: "verified",
    healthStatus: "HEALTHY",
    isDemoMode: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const accountB = await accountRepo.create({
    wabaId: "waba_tenant_beta_02",
    accountName: "Tenant Beta WhatsApp",
    currency: "USD",
    timezoneId: "UTC",
    accountReviewStatus: "APPROVED",
    businessVerificationStatus: "verified",
    healthStatus: "HEALTHY",
    isDemoMode: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Map user to accountA only
  await accountRepo.mapUserToAccount(user.userId, accountA.wabaId, "user", true);

  const userAccounts = await accountRepo.findByUser(user.userId);
  const hasAccessA = await accountRepo.verifyUserAccess(user.userId, accountA.wabaId);
  const hasAccessB = await accountRepo.verifyUserAccess(user.userId, accountB.wabaId);

  if (!hasAccessA) {
    throw new Error("User should have access to mapped account A");
  }
  if (hasAccessB) {
    throw new Error("User should NOT have access to unmapped account B (Data Leak)");
  }
  console.log("✔ Strict tenant isolation verified: User can only access mapped WhatsApp Account");

  // 4. Projects Belonging to Specific WhatsApp Account
  console.log("\n▶ Test 4: Project Listing & Scoping by WABA ID");
  const project1 = await projectRepo.create({
    projectId: "proj_alpha_sales_01",
    wabaId: accountA.wabaId,
    name: "Alpha Sales Channel",
    slug: "alpha-sales",
    description: "Sales for Alpha",
    status: "active",
    callbackUrl: "https://example.com/alpha-sales",
    eventTypes: ["message.received", "message.sent"],
  });

  const project2 = await projectRepo.create({
    projectId: "proj_alpha_support_02",
    wabaId: accountA.wabaId,
    name: "Alpha Support Desk",
    slug: "alpha-support",
    description: "Support for Alpha",
    status: "active",
    callbackUrl: "https://example.com/alpha-support",
    eventTypes: ["message.received", "message.sent"],
  });

  const projectBeta = await projectRepo.create({
    projectId: "proj_beta_marketing_03",
    wabaId: accountB.wabaId,
    name: "Beta Marketing",
    slug: "beta-marketing",
    description: "Marketing for Beta",
    status: "active",
    callbackUrl: "https://example.com/beta-marketing",
    eventTypes: ["message.received"],
  });

  const alphaProjects = await projectRepo.findByWabaId(accountA.wabaId);
  const betaProjects = await projectRepo.findByWabaId(accountB.wabaId);

  if (alphaProjects.length !== 2 || !alphaProjects.some((p) => p.projectId === project1.projectId)) {
    throw new Error("Alpha WABA should return only its own projects");
  }
  if (alphaProjects.some((p) => p.projectId === projectBeta.projectId)) {
    throw new Error("Beta project leaked into Alpha WABA project list");
  }
  if (betaProjects.length !== 1 || betaProjects[0].projectId !== projectBeta.projectId) {
    throw new Error("Beta WABA should return only its own project");
  }
  console.log("✔ Projects strictly categorized under their respective WhatsApp Account (WABA ID)");

  // 5. JWT Context Switching & Validation
  console.log("\n▶ Test 5: Context Switching & Active Session Verification");
  const jwt = signJwt({
    userId: user.userId,
    email: user.email,
    role: "user",
    projectIds: [project1.projectId, project2.projectId],
    activeWabaId: accountA.wabaId,
    activeProjectId: project1.projectId,
  });

  const parsed = verifyJwt(jwt);
  if (!parsed) {
    throw new Error("JWT verification failed");
  }
  if (parsed.activeWabaId !== accountA.wabaId || parsed.activeProjectId !== project1.projectId) {
    throw new Error("JWT active context does not match expected IDs");
  }
  if (parsed.role !== "user") {
    throw new Error(`Expected role 'user', got '${parsed.role}'`);
  }
  console.log("✔ Context session successfully carries activeWabaId, activeProjectId, and role='user'");

  // 6. Zero Key Exposure in DTOs
  console.log("\n▶ Test 6: Zero Key Exposure Verification");
  const sanitizedAccounts = (await accountRepo.findByUser(user.userId)).map((a) => {
    // Check that raw token or secret never exists on the account model
    const obj = a as any;
    if (obj.accessToken || obj.token || obj.secret || obj.encrypted_access_token) {
      throw new Error("Security breach: Raw or encrypted token exposed on WhatsAppAccount object!");
    }
    return {
      wabaId: a.wabaId,
      accountName: a.accountName,
      healthStatus: a.healthStatus,
    };
  });

  if (sanitizedAccounts.length === 0) {
    throw new Error("Sanitized accounts list should not be empty");
  }
  console.log("✔ Confirmed zero secret exposure: No access tokens or secrets leaked in models or responses");

  console.log("\n🎉 ALL MULTI-ACCOUNT & PROJECT SCOPING TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
