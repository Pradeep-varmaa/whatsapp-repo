"use client";

import React from "react";
import { Tag, Button, Tooltip, message } from "antd";
import {
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  BookOpen,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import styles from "./setup-guide.module.css";

export default function SetupGuidePage() {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Copied ${label} to clipboard!`);
  };

  const requiredVariables = [
    {
      name: "PHONE NUMBER ID",
      envKey: "PHONE_NUMBER_ID",
      where: "Meta App Dashboard → WhatsApp → API Setup → Under 'Phone number ID'.",
      link: "https://developers.facebook.com/apps",
      linkLabel: "Open Apps Dashboard",
      example: "109283746501928",
      desc: "Identifier for your verified sender phone number.",
    },
    {
      name: "ACCOUNT ID",
      envKey: "ACCOUNT_ID / WHATSAPP_WABA_ID",
      where: "Meta App Dashboard → WhatsApp → API Setup → Next to 'WhatsApp Business Account ID'.",
      link: "https://developers.facebook.com/apps",
      linkLabel: "Open Apps Dashboard",
      example: "315448454992777",
      desc: "Your WhatsApp Business Account (WABA) identifier.",
    },
    {
      name: "APP SECRET",
      envKey: "APP_SECRET",
      where: "Meta App Dashboard → App settings → Basic → Click 'Show' next to App secret.",
      link: "https://developers.facebook.com/apps",
      linkLabel: "Open Basic Settings",
      example: "a1b2c3d4e5f67890abcdef1234567890",
      desc: "Validates incoming webhook HMAC-SHA256 signatures.",
    },
    {
      name: "MOBILE NUMBER",
      envKey: "MOBILE_NUMBER",
      where: "Registered WhatsApp business number in E.164 format with country code.",
      link: null,
      linkLabel: null,
      example: "+15550192831",
      desc: "Your live outbound sender phone number.",
    },
    {
      name: "ACCESS TOKEN",
      envKey: "ACCESS_TOKEN / WHATSAPP_ACCESS_TOKEN",
      where: "Meta Business Settings → Users → System users → Generated under System User.",
      link: "https://business.facebook.com/settings/system-users",
      linkLabel: "Open System Users",
      example: "EAAG...",
      desc: "Permanent System User Token (whatsapp_business_messaging, whatsapp_business_management).",
    },
  ];

  return (
    <div className={styles.container}>
      {/* Single Master Section / Card */}
      <div className={`glass ${styles.unifiedCard}`}>
        {/* Header Section */}
        <div className={styles.headerSection}>
          <div className={styles.badgeRow}>
            <Tag color="green">WhatsApp Cloud API</Tag>
            <Tag color="blue">Graph API v25.0</Tag>
            <Tag color="purple">Production Foundation</Tag>
          </div>
          <h1 className={styles.title}>
            Meta WhatsApp Business Account & Cloud API Setup Guide
          </h1>
          <p className={styles.subtitle}>
            Step-by-step developer walkthrough to create your Meta Business Portfolio, onboard a verified business phone number, generate a permanent System User Token, and configure the engine.
          </p>
        </div>

        {/* Unified Body Content */}
        <div className={styles.bodyContent}>
          {/* 1. Required Variables Section */}
          <div>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <KeyRound size={20} color="var(--wa-primary)" />
                <div>
                  <h2 className={styles.sectionTitle}>5 Required Engine Variables</h2>
                  <span className={styles.sectionSubtitle}>
                    Configure these in your <code>.env.local</code> to authenticate and communicate with Meta.
                  </span>
                </div>
              </div>
              <Button
                size="small"
                icon={<Copy size={13} />}
                onClick={() => {
                  const envBlock = requiredVariables
                    .map((v) => `${v.name.replace(/ /g, "_")}=${v.example}`)
                    .join("\n");
                  copyToClipboard(envBlock, "sample .env template");
                }}
              >
                Copy Sample .env
              </Button>
            </div>

            <table className={styles.variablesTable}>
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Variable</th>
                  <th style={{ width: "42%" }}>Location in Meta Portal</th>
                  <th style={{ width: "26%" }}>Example / Env Key</th>
                  <th style={{ width: "10%", textAlign: "center" }}>Copy</th>
                </tr>
              </thead>
              <tbody>
                {requiredVariables.map((v) => (
                  <tr key={v.name}>
                    <td>
                      <div className={styles.varNameCell}>{v.name}</div>
                      <div style={{ fontSize: 11, color: "var(--wa-text-muted)", marginTop: 2 }}>
                        {v.desc}
                      </div>
                    </td>
                    <td>
                      <div className={styles.varDescCell}>{v.where}</div>
                      {v.link && (
                        <a
                          href={v.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.inlinePortalLink}
                        >
                          {v.linkLabel} <ExternalLink size={11} />
                        </a>
                      )}
                    </td>
                    <td>
                      <div className={styles.varExampleCell}>{v.example}</div>
                      <div style={{ marginTop: 4 }}>
                        <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>
                          {v.envKey}
                        </Tag>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <Tooltip title={`Copy ${v.name}`}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Copy size={13} />}
                          onClick={() => copyToClipboard(v.name, v.name)}
                        />
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.divider} />

          {/* 2. Pre-requisites Checklist Bar */}
          <div className={styles.prerequisitesBar}>
            <div className={styles.sectionTitleGroup}>
              <ShieldCheck size={18} color="var(--wa-primary)" />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
                Pre-requisites Checklist
              </h3>
            </div>
            <div className={styles.checkGrid}>
              <div className={styles.checkItem}>
                <CheckCircle2 size={16} color="var(--wa-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Personal Meta/Facebook account for developer onboarding.</span>
              </div>
              <div className={styles.checkItem}>
                <CheckCircle2 size={16} color="var(--wa-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Dedicated mobile number able to receive SMS / voice OTP.</span>
              </div>
              <div className={styles.checkItem}>
                <CheckCircle2 size={16} color="var(--wa-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Number must NOT be active on personal WhatsApp app.</span>
              </div>
              <div className={styles.checkItem}>
                <CheckCircle2 size={16} color="var(--wa-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Credit/Debit card ready for Business Portfolio billing.</span>
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* 3. Step-by-Step Walkthrough */}
          <div>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <BookOpen size={20} color="var(--wa-primary)" />
                <div>
                  <h2 className={styles.sectionTitle}>Step-by-Step Walkthrough</h2>
                  <span className={styles.sectionSubtitle}>
                    Follow each phase in sequential order to complete your onboarding.
                  </span>
                </div>
              </div>
            </div>

            {/* Step 1 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>1</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Register as a Meta Developer</h3>
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  developers.facebook.com <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                Before creating apps, your Meta profile must be enrolled in the Meta Developer platform.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--wa-primary)", fontWeight: 600 }}>developers.facebook.com</a> and click <strong>Log In</strong> in the top right.
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Get Started</strong> or <strong>My Apps</strong> and accept the Meta Developer Terms.
                </li>
                <li className={styles.bulletItem}>
                  Complete phone number verification via SMS code to activate developer status.
                </li>
              </ul>
            </div>

            {/* Step 2 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>2</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Create a Meta App & Business Portfolio</h3>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  Meta Apps Dashboard <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                The Meta App is the technical container that manages API credentials, webhooks, and permissions.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  Click <strong>Create App</strong> in your <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: "var(--wa-primary)", fontWeight: 600 }}>Meta App Dashboard</a>.
                </li>
                <li className={styles.bulletItem}>
                  Select <strong>Other</strong> &rarr; Click <strong>Next</strong> &rarr; Choose <strong>Business</strong> as App Type.
                </li>
                <li className={styles.bulletItem}>
                  Set <strong>App Name</strong> (e.g. <code>WhatsApp Communication Engine</code>) and Contact Email.
                </li>
                <li className={styles.bulletItem}>
                  Under <strong>Business Portfolio</strong>: Select your portfolio, or choose <em>Create a new business portfolio</em> (Meta will create one automatically).
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Create App</strong> to finalize.
                </li>
              </ul>
            </div>

            {/* Step 3 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>3</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Add WhatsApp Product to Your App</h3>
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  WhatsApp Cloud API Docs <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                Activate the WhatsApp Cloud API engine for your newly created app.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  In your App Dashboard overview, scroll down to <strong>Add products to your app</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Find the <strong>WhatsApp</strong> tile and click <strong>Set up</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Select your Meta Business Portfolio to associate with WhatsApp and click <strong>Continue</strong>.
                </li>
                <li className={styles.bulletItem}>
                  You will land on the <strong>WhatsApp &gt; API Setup</strong> console in the left sidebar.
                </li>
              </ul>
            </div>

            {/* Step 4 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>4</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Register Your Real Business Mobile Number</h3>
                <a
                  href="https://www.facebook.com/business/help/529612240544278"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  Display Name Guidelines <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                Onboard your real company phone number to replace Meta's temporary sandbox number:
              </p>
              <div className={styles.warningBox}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Important:</strong> Your number must NOT be active on WhatsApp mobile apps. If registered, open WhatsApp &rarr; <em>Settings &gt; Account &gt; Delete my account</em> first.
                </span>
              </div>
              <ul className={styles.bulletList} style={{ marginTop: 8 }}>
                <li className={styles.bulletItem}>
                  On the <strong>API Setup</strong> page, scroll to <strong>Step 2: Add a phone number</strong> &rarr; Click <strong>Add phone number</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Enter your <strong>Business Display Name</strong> and Category.
                </li>
                <li className={styles.bulletItem}>
                  Enter your <strong>MOBILE NUMBER</strong> with international country code.
                </li>
                <li className={styles.bulletItem}>
                  Select <strong>Text Message (SMS)</strong> or <strong>Phone Call</strong> and verify with the 6-digit OTP.
                </li>
              </ul>
            </div>

            {/* Step 5 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>5</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Add a Payment Method (Billing)</h3>
                <a
                  href="https://business.facebook.com/settings/whatsapp-business-accounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  WhatsApp Accounts Settings <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                Attach a payment card for WhatsApp conversation charges beyond free tier limits.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  Open <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noopener noreferrer" style={{ color: "var(--wa-primary)", fontWeight: 600 }}>Business Settings &gt; WhatsApp Accounts</a>.
                </li>
                <li className={styles.bulletItem}>
                  Select your WhatsApp Business Account &rarr; Click the <strong>Settings</strong> tab.
                </li>
                <li className={styles.bulletItem}>
                  Under <strong>Payment Method</strong>, click <strong>Add Payment Method</strong> and enter your card details.
                </li>
              </ul>
            </div>

            {/* Step 6 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>6</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Create a System User & Generate Permanent Token</h3>
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  Open System Users Settings <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                The temporary access token on the API Setup page expires after 24 hours. Production engines must use a <strong>Permanent System User Access Token</strong>.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  In <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" style={{ color: "var(--wa-primary)", fontWeight: 600 }}>Meta Business Settings</a>, navigate to <strong>Users &gt; System users</strong> in the left sidebar.
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Add (+ Add)</strong>. Enter a name (e.g. <code>engine_worker</code>) and set role to <strong>Admin</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Select the new System User and click <strong>Assign Assets</strong>, then grant full control in both sections:
                  <div className={styles.assetTable}>
                    <div className={styles.assetTableHeader}>
                      <span>Section</span>
                      <span>What to do</span>
                    </div>
                    <div className={styles.assetTableRow}>
                      <span className={styles.assetSection}>Under <strong>Apps</strong></span>
                      <span>Select your app → Toggle <strong>Full control (Manage app)</strong> → Save</span>
                    </div>
                    <div className={styles.assetTableRow}>
                      <span className={styles.assetSection}>Under <strong>WhatsApp Accounts</strong></span>
                      <span>Select your WABA → Toggle <strong>Full control (Manage WhatsApp Business Account)</strong> → Save Changes</span>
                    </div>
                  </div>
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Generate New Token</strong>:
                  <div className={styles.assetTable}>
                    <div className={styles.assetTableHeader}>
                      <span>Setting</span>
                      <span>Value</span>
                    </div>
                    <div className={styles.assetTableRow}>
                      <span className={styles.assetSection}>Select your App from the dropdown</span>
                      <span>Choose your WhatsApp app</span>
                    </div>
                    <div className={styles.assetTableRow}>
                      <span className={styles.assetSection}>Select Token Expiration</span>
                      <span><strong>Never</strong> (or 60 days if rolling)</span>
                    </div>
                    <div className={styles.assetTableRow}>
                      <span className={styles.assetSection}>Check the 3 mandatory permissions</span>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <Tag color="green">whatsapp_business_messaging</Tag>
                        <Tag color="green">whatsapp_business_management</Tag>
                        <Tag color="blue">business_management</Tag>
                      </span>
                    </div>
                  </div>
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Generate Token</strong>. Copy your <strong>ACCESS TOKEN</strong> immediately and store it securely.
                </li>
                <li className={styles.bulletItem}>
                  Verify your token status anytime using the <a href="https://developers.facebook.com/tools/debug/accesstoken" target="_blank" rel="noopener noreferrer" style={{ color: "var(--wa-primary)", fontWeight: 600 }}>Meta Access Token Debugger <ExternalLink size={11} style={{ display: "inline" }} /></a>.
                </li>
              </ul>
            </div>

            {/* Step 7 */}
            <div className={styles.stepBlock}>
              <div className={styles.stepNumberBadge}>7</div>
              <div className={styles.stepHeader}>
                <h3 className={styles.stepTitle}>Configure Webhook for Inbound Messages</h3>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlinePortalLink}
                >
                  Meta App Configuration <ExternalLink size={12} />
                </a>
              </div>
              <p className={styles.stepDescription}>
                Connect your server URL so customer WhatsApp replies and delivery updates reach your engine.
              </p>
              <ul className={styles.bulletList}>
                <li className={styles.bulletItem}>
                  In your Meta App Dashboard, navigate to <strong>WhatsApp &gt; Configuration</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Edit</strong> next to Webhooks:
                  <div className={styles.subConfigBox}>
                    <div className={styles.subConfigRow}>
                      <span className={styles.subConfigLabel}>Callback URL:</span>
                      <code className={styles.subConfigValue}>https://&lt;YOUR_DOMAIN&gt;/webhooks/whatsapp/meta</code>
                    </div>
                    <div className={styles.subConfigRow}>
                      <span className={styles.subConfigLabel}>Verify Token:</span>
                      <code className={styles.subConfigValue}>engine_verify_token_secure</code>
                    </div>
                  </div>
                </li>
                <li className={styles.bulletItem}>
                  Click <strong>Verify and save</strong>.
                </li>
                <li className={styles.bulletItem}>
                  Under <strong>Webhook fields</strong>, click <strong>Manage</strong> and check <code>messages</code>.
                </li>
              </ul>
            </div>
          </div>

          <div className={styles.divider} />

          {/* 4. Verification cURL Box */}
          <div>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <Terminal size={18} color="var(--wa-primary)" />
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
                    Verify Credentials with cURL
                  </h3>
                  <span className={styles.sectionSubtitle}>
                    Run this command in terminal to test your ACCESS TOKEN and PHONE NUMBER ID directly against Meta Graph API v25.0:
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.codeBox}>
              <div className={styles.codeBoxHeader}>
                <span>BASH / TERMINAL</span>
                <Button
                  type="text"
                  size="small"
                  icon={<Copy size={12} color="#9CA3AF" />}
                  onClick={() => {
                    const curlCmd = `curl -X POST "https://graph.facebook.com/v25.0/PHONE_NUMBER_ID/messages" \\
  -H "Authorization: Bearer ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messaging_product": "whatsapp",
    "to": "RECIPIENT_MOBILE_NUMBER",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'`;
                    copyToClipboard(curlCmd, "Test cURL Command");
                  }}
                >
                  <span style={{ color: "#9CA3AF", fontSize: 11 }}>Copy Command</span>
                </Button>
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{`curl -X POST "https://graph.facebook.com/v25.0/PHONE_NUMBER_ID/messages" \\
  -H "Authorization: Bearer ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messaging_product": "whatsapp",
    "to": "RECIPIENT_MOBILE_NUMBER",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": {
        "code": "en_US"
      }
    }
  }'`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
