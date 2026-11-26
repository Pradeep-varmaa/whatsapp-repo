"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Table,
  Input,
  Tag,
  Select,
  Badge,
  Button,
  Modal,
  Alert,
  Tooltip,
  Empty,
  message,
  Popconfirm,
  Form,
  Switch,
  Steps,
  Radio,
  Tabs,
} from "antd";
import {
  PhoneCall,
  Search,
  FolderGit2,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  Copy,
  Check,
  BookOpen,
  Plus,
  KeyRound,
  Trash2,
  Building2,
  ShieldCheck,
  Send,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { PhoneNumber, Project } from "@/shared/types";
import styles from "./phone-numbers.module.css";

const COMMON_COUNTRY_CODES = [
  { value: "1", label: "+1 (United States & Canada)" },
  { value: "91", label: "+91 (India)" },
  { value: "44", label: "+44 (United Kingdom)" },
  { value: "61", label: "+61 (Australia)" },
  { value: "49", label: "+49 (Germany)" },
  { value: "33", label: "+33 (France)" },
  { value: "971", label: "+971 (United Arab Emirates)" },
  { value: "65", label: "+65 (Singapore)" },
  { value: "55", label: "+55 (Brazil)" },
  { value: "52", label: "+52 (Mexico)" },
  { value: "34", label: "+34 (Spain)" },
  { value: "39", label: "+39 (Italy)" },
  { value: "31", label: "+31 (Netherlands)" },
  { value: "81", label: "+81 (Japan)" },
  { value: "82", label: "+82 (South Korea)" },
  { value: "86", label: "+86 (China)" },
  { value: "234", label: "+234 (Nigeria)" },
  { value: "27", label: "+27 (South Africa)" },
  { value: "966", label: "+966 (Saudi Arabia)" },
  { value: "62", label: "+62 (Indonesia)" },
  { value: "92", label: "+92 (Pakistan)" },
  { value: "880", label: "+880 (Bangladesh)" },
  { value: "63", label: "+63 (Philippines)" },
  { value: "84", label: "+84 (Vietnam)" },
];

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metaError, setMetaError] = useState<{ code: string; message: string; details?: any } | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Project Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Registration Modal & Wizard State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"wizard" | "import">("wizard");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Wizard metadata state (Note: PIN and verification code are NEVER retained after step completion)
  const [wizardPhoneId, setWizardPhoneId] = useState<string>("");
  const [wizardDisplayPhone, setWizardDisplayPhone] = useState<string>("");
  const [wizardVerifiedName, setWizardVerifiedName] = useState<string>("");
  const [wizardMethod, setWizardMethod] = useState<"SMS" | "VOICE">("SMS");
  const [wizardLanguage, setWizardLanguage] = useState<string>("en_US");

  // Resend Countdown Timer (60s)
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Deregistration State
  const [isDeregistering, setIsDeregistering] = useState<string | null>(null);

  // Forms
  const [step1Form] = Form.useForm();
  const [step2Form] = Form.useForm();
  const [step3Form] = Form.useForm();
  const [importForm] = Form.useForm();

  // Handle countdown interval
  useEffect(() => {
    if (resendCountdown > 0) {
      timerRef.current = setTimeout(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resendCountdown]);

  const fetchPhoneNumbers = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    }

    try {
      const url = isManualRefresh ? "/api/phone-numbers?refresh=true" : "/api/phone-numbers";
      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        setNumbers(data.data);
        if (data.meta?.warning) {
          setMetaError({ code: "META_WARNING", message: data.meta.warning });
        } else {
          setMetaError(null);
        }
        if (isManualRefresh) {
          message.success("Refreshed phone numbers from Meta Graph API!");
        }
      } else {
        setMetaError({
          code: data.error?.code || "META_FETCH_ERROR",
          message: data.error?.message || "Failed to retrieve phone numbers from Meta Graph API",
          details: data.error?.details,
        });
        if (Array.isArray(data.data) && data.data.length > 0) {
          setNumbers(data.data);
        }
      }
    } catch (err: any) {
      setMetaError({
        code: "NETWORK_ERROR",
        message: err.message || "Network error fetching phone numbers",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) {
        await fetchPhoneNumbers();
        await fetchProjects();
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    message.success("Phone Number ID copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAssignProject = async (phoneNumberId: string, projectId: string | null) => {
    setIsAssigning(true);
    try {
      const res = await fetch("/api/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          projectId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        message.success(
          projectId
            ? `Phone number assigned to project: ${data.data?.projectName || "Project"}`
            : "Phone number unassigned from project"
        );
        setAssignModalOpen(false);
        setSelectedPhone(null);
        fetchPhoneNumbers();
        fetchProjects();
      } else {
        message.error(data.error?.message || "Failed to update project assignment");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to update project assignment");
    } finally {
      setIsAssigning(false);
    }
  };

  const openAssignModal = (record: PhoneNumber) => {
    setSelectedPhone(record);
    setTargetProjectId(record.projectId || null);
    setAssignModalOpen(true);
  };

  const openWizard = (record?: PhoneNumber, startStep = 0) => {
    setStepError(null);
    step1Form.resetFields();
    step2Form.resetFields();
    step3Form.resetFields();
    importForm.resetFields();

    if (record) {
      setWizardPhoneId(record.phoneNumberId);
      setWizardDisplayPhone(record.displayPhoneNumber || record.phoneNumberId);
      setWizardVerifiedName(record.verifiedName || "");
      setCurrentStep(startStep);
      setModalTab("wizard");
      if (startStep === 2) {
        step3Form.setFieldsValue({
          projectId: record.projectId || null,
          isDefault: Boolean(record.isDefault),
        });
      }
    } else {
      setWizardPhoneId("");
      setWizardDisplayPhone("");
      setWizardVerifiedName("");
      setCurrentStep(0);
      setModalTab("wizard");
      step1Form.setFieldsValue({
        cc: "1",
        method: "SMS",
        language: "en_US",
      });
    }

    setRegisterModalOpen(true);
  };

  const closeWizard = () => {
    setRegisterModalOpen(false);
    step1Form.resetFields();
    step2Form.resetFields();
    step3Form.resetFields();
    importForm.resetFields();
    setStepError(null);
    setWizardPhoneId("");
    setWizardDisplayPhone("");
    setWizardVerifiedName("");
    setResendCountdown(0);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  // Step 1: Add raw phone number to Meta WABA and request verification code
  const handleStep1Submit = async (values: any) => {
    setIsSubmittingStep(true);
    setStepError(null);

    const cleanCc = String(values.cc || "").replace(/\D/g, "");
    const cleanPhone = String(values.phoneNumber || "").replace(/\D/g, "");
    const verifiedName = String(values.verifiedName || "").trim();
    const method = (values.method || "SMS") as "SMS" | "VOICE";
    const language = String(values.language || "en_US").trim();

    try {
      // 1. Add number: POST /api/phone-numbers/add
      const addRes = await fetch("/api/phone-numbers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cc: cleanCc,
          phoneNumber: cleanPhone,
          verifiedName,
        }),
      });
      const addData = await addRes.json();

      if (!addData.success || !addData.data?.phoneNumberId) {
        setStepError(addData.error?.message || "Failed to add phone number to Meta WhatsApp Business Account.");
        return;
      }

      const newPhoneId = addData.data.phoneNumberId;
      const formattedDisplay = `+${cleanCc} ${cleanPhone}`;

      setWizardPhoneId(newPhoneId);
      setWizardDisplayPhone(formattedDisplay);
      setWizardVerifiedName(verifiedName);
      setWizardMethod(method);
      setWizardLanguage(language);

      // 2. Request code: POST /api/phone-numbers/request-code
      const reqCodeRes = await fetch("/api/phone-numbers/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: newPhoneId,
          method,
          language,
        }),
      });
      const reqCodeData = await reqCodeRes.json();

      if (!reqCodeData.success) {
        setStepError(
          reqCodeData.error?.message ||
            `Phone number was registered, but failed to send verification code via ${method}. You can retry sending the code.`
        );
        // Advance to step 2 anyway so the user can retry or enter code
        setCurrentStep(1);
        setResendCountdown(10);
        return;
      }

      message.success(`Verification code sent via ${method} to ${formattedDisplay}!`);
      setCurrentStep(1);
      setResendCountdown(60);
    } catch (err: any) {
      setStepError(err.message || "Network error while connecting to Meta Graph API.");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Resend verification code in Step 2
  const handleResendCode = async () => {
    if (!wizardPhoneId) return;
    setIsSubmittingStep(true);
    setStepError(null);

    try {
      const res = await fetch("/api/phone-numbers/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: wizardPhoneId,
          method: wizardMethod,
          language: wizardLanguage,
        }),
      });
      const data = await res.json();

      if (data.success) {
        message.success(`New verification code sent via ${wizardMethod} to ${wizardDisplayPhone}!`);
        setResendCountdown(60);
      } else {
        setStepError(data.error?.message || "Failed to resend verification code.");
      }
    } catch (err: any) {
      setStepError(err.message || "Network error while resending code.");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Step 2: Verify code
  const handleStep2Submit = async (values: any) => {
    if (!wizardPhoneId) return;
    setIsSubmittingStep(true);
    setStepError(null);

    const cleanCode = String(values.code || "").trim();

    try {
      const res = await fetch("/api/phone-numbers/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: wizardPhoneId,
          code: cleanCode,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Zero security risk: Clean verification code immediately
        step2Form.resetFields();
        message.success("Phone number verified successfully with Meta!");
        setCurrentStep(2);
      } else {
        setStepError(data.error?.message || "Incorrect verification code. Please check and retry.");
      }
    } catch (err: any) {
      setStepError(err.message || "Network error verifying code.");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Step 3: Register phone number with 6-digit PIN and finish onboarding
  const handleStep3Submit = async (values: any) => {
    if (!wizardPhoneId) return;
    setIsSubmittingStep(true);
    setStepError(null);

    const cleanPin = String(values.pin || "").trim();
    const projectId = values.projectId || null;
    const isDefault = Boolean(values.isDefault);

    try {
      const res = await fetch("/api/phone-numbers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: wizardPhoneId,
          pin: cleanPin,
          projectId,
          isDefault,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Zero security risk: Clean PIN immediately
        step3Form.resetFields();
        message.success(`WhatsApp Phone Number ${wizardDisplayPhone || wizardPhoneId} registered and active!`);
        closeWizard();
        fetchPhoneNumbers(true);
        fetchProjects();
      } else {
        setStepError(data.error?.message || "Failed to complete phone registration with Meta.");
      }
    } catch (err: any) {
      setStepError(err.message || "Network error registering phone number.");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Import existing number flow (for numbers already in WABA)
  const handleImportSubmit = async (values: any) => {
    setIsSubmittingStep(true);
    setStepError(null);

    const phoneNumberId = String(values.phoneNumberId || "").trim();
    const pin = String(values.pin || "").trim();
    const projectId = values.projectId || null;
    const isDefault = Boolean(values.isDefault);

    try {
      const res = await fetch("/api/phone-numbers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          pin,
          projectId,
          isDefault,
        }),
      });
      const data = await res.json();

      if (data.success) {
        importForm.resetFields();
        message.success(`Phone number ${phoneNumberId} registered successfully!`);
        closeWizard();
        fetchPhoneNumbers(true);
        fetchProjects();
      } else {
        setStepError(data.error?.message || "Failed to register existing phone number.");
      }
    } catch (err: any) {
      setStepError(err.message || "Network error registering phone number.");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  const handleDeregisterNumber = async (phoneNumberId: string) => {
    setIsDeregistering(phoneNumberId);
    try {
      const res = await fetch(`/api/phone-numbers?phoneNumberId=${encodeURIComponent(phoneNumberId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Phone number ${phoneNumberId} deregistered successfully!`);
        fetchPhoneNumbers(true);
      } else {
        message.error(data.error?.message || "Failed to deregister phone number.");
      }
    } catch (err: any) {
      message.error(err.message || "Network error while deregistering phone number.");
    } finally {
      setIsDeregistering(null);
    }
  };

  const filtered = numbers.filter((n) => {
    const matchesSearch =
      (n.displayPhoneNumber && n.displayPhoneNumber.toLowerCase().includes(search.toLowerCase())) ||
      (n.phoneNumberId && n.phoneNumberId.toLowerCase().includes(search.toLowerCase())) ||
      (n.verifiedName && n.verifiedName.toLowerCase().includes(search.toLowerCase())) ||
      (n.wabaId && n.wabaId.toLowerCase().includes(search.toLowerCase()));

    const matchesProject =
      projectFilter === "all" ||
      (projectFilter === "unassigned" && !n.projectId) ||
      n.projectId === projectFilter;

    return matchesSearch && matchesProject;
  });

  const columns = [
    {
      title: "Display Number & Sender Name",
      key: "displayNumber",
      width: 290,
      render: (_: any, r: PhoneNumber) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontWeight: 600, color: "var(--wa-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <PhoneCall size={15} color="#075E54" />
            <span>{r.displayPhoneNumber || r.phoneNumberId}</span>
            {r.isDefault && (
              <Tag color="success" style={{ fontSize: 10, margin: 0 }}>
                DEFAULT
              </Tag>
            )}
            {r.isMetaDiscovered === false && (
              <Tooltip title="Historical number in database, not returned in current Meta Graph API query">
                <Tag color="warning" style={{ fontSize: 10, margin: 0 }}>
                  HISTORICAL
                </Tag>
              </Tooltip>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            {r.verifiedName || <span style={{ color: "var(--wa-text-muted)" }}>No Verified Name</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--wa-text-muted)", fontFamily: "monospace" }}>
            <span>ID: {r.phoneNumberId}</span>
            <button
              onClick={() => handleCopy(r.phoneNumberId)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--wa-text-muted)" }}
              title="Copy Phone Number ID"
            >
              {copiedId === r.phoneNumberId ? <Check size={12} color="#075E54" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      ),
    },
    {
      title: "Assigned Project Mapping",
      key: "mapping",
      width: 240,
      render: (_: any, r: PhoneNumber) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FolderGit2 size={14} color="#075E54" />
            <span style={{ fontWeight: 600, fontSize: 12, color: r.projectId ? "var(--wa-text-primary)" : "var(--wa-text-muted)" }}>
              {r.projectName || "Unassigned"}
            </span>
          </div>

          <Button
            size="small"
            style={{ width: "fit-content", fontSize: 11, height: 24, padding: "0 8px" }}
            onClick={() => openAssignModal(r)}
          >
            {r.projectId ? "Change Project" : "Assign to Project"}
          </Button>
        </div>
      ),
    },
    {
      title: "Quality Rating",
      dataIndex: "qualityRating",
      key: "qualityRating",
      width: 140,
      render: (rating?: string) => {
        if (!rating || rating === "UNKNOWN" || rating === "NA") {
          return <Tag style={{ fontSize: 11, fontFamily: "monospace" }}>Not Reported</Tag>;
        }
        let color = "default";
        if (rating === "GREEN") color = "success";
        else if (rating === "YELLOW") color = "warning";
        else if (rating === "RED") color = "error";
        return (
          <Tag color={color} style={{ fontSize: 11, textTransform: "uppercase", fontFamily: "monospace" }}>
            ● {rating}
          </Tag>
        );
      },
    },
    {
      title: "Verification Status",
      key: "verification",
      width: 160,
      render: (_: any, r: PhoneNumber) => {
        const status = r.codeVerificationStatus || r.nameStatus || "UNKNOWN";
        if (status === "NOT_VERIFIED") {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Badge status="warning" />
              <span style={{ fontSize: 12, color: "#D97706", fontWeight: 600 }}>NOT VERIFIED</span>
            </div>
          );
        }
        return (
          <Badge
            status={status === "VERIFIED" || status === "APPROVED" ? "success" : "default"}
            text={<span style={{ fontSize: 12, color: "var(--wa-text-primary)", fontWeight: 500 }}>{status}</span>}
          />
        );
      },
    },
    {
      title: "Connection Status",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (st?: string) => {
        if (!st || st === "UNKNOWN") {
          return <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>Unknown</span>;
        }
        let badgeStatus: "success" | "processing" | "error" | "default" = "default";
        if (st === "CONNECTED") badgeStatus = "processing";
        else if (st === "DISCONNECTED" || st === "RESTRICTED") badgeStatus = "error";
        else if (st === "PENDING" || st === "UNVERIFIED") badgeStatus = "warning" as any;

        return (
          <Badge
            status={badgeStatus}
            text={<span style={{ fontSize: 12, color: "var(--wa-text-primary)", fontWeight: 500 }}>{st}</span>}
          />
        );
      },
    },
    {
      title: "Messaging Tier",
      dataIndex: "messagingLimitTier",
      key: "messagingLimitTier",
      width: 130,
      render: (tier?: string) => {
        if (!tier || tier === "NOT_REPORTED" || tier === "UNKNOWN") {
          return <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>—</span>;
        }
        const cleanTier = tier.replace("TIER_", "");
        return (
          <Tag color="geekblue" style={{ fontSize: 11, fontFamily: "monospace" }}>
            {cleanTier}/day
          </Tag>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 220,
      fixed: "right" as const,
      render: (_: any, r: PhoneNumber) => {
        const needsVerification = r.codeVerificationStatus === "NOT_VERIFIED";
        const needsPinRegistration = r.codeVerificationStatus === "VERIFIED" && r.status !== "CONNECTED";

        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {needsVerification ? (
              <Button
                size="small"
                type="primary"
                style={{ backgroundColor: "#D97706", fontSize: 11, height: 26, padding: "0 8px" }}
                onClick={() => openWizard(r, 1)}
              >
                Verify Code
              </Button>
            ) : needsPinRegistration ? (
              <Button
                size="small"
                type="primary"
                style={{ backgroundColor: "var(--wa-primary)", fontSize: 11, height: 26, padding: "0 8px" }}
                onClick={() => openWizard(r, 2)}
              >
                Set PIN & Save
              </Button>
            ) : (
              <Button
                size="small"
                type="dashed"
                icon={<KeyRound size={12} />}
                onClick={() => openWizard(r, 2)}
                style={{ fontSize: 11, height: 26, padding: "0 8px" }}
              >
                Configure
              </Button>
            )}

            <Popconfirm
              title="Deregister phone number?"
              description={`Are you sure you want to deregister ${r.displayPhoneNumber || r.phoneNumberId} from WhatsApp Cloud API?`}
              onConfirm={() => handleDeregisterNumber(r.phoneNumberId)}
              okText="Deregister"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                size="small"
                icon={<Trash2 size={12} />}
                loading={isDeregistering === r.phoneNumberId}
                style={{ fontSize: 11, height: 26, padding: "0 8px" }}
              >
                Deregister
              </Button>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className={styles.header}>
          <h2 className={styles.title}>Meta WhatsApp Phone Numbers</h2>
          <p className={styles.subtitle}>
            Live sender numbers retrieved dynamically from Meta WhatsApp Cloud API (Graph API v25.0) and mapped to internal MSSQL projects.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button
            type="primary"
            icon={<Plus size={14} />}
            style={{ backgroundColor: "var(--wa-primary)" }}
            onClick={() => openWizard()}
          >
            Register New Number
          </Button>
          <Link href="/setup-guide">
            <Button icon={<BookOpen size={14} />}>
              Meta Setup Guide
            </Button>
          </Link>
          <Button
            icon={<RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />}
            onClick={() => fetchPhoneNumbers(true)}
            loading={isRefreshing}
          >
            Refresh from Meta
          </Button>
        </div>
      </div>

      {/* Meta API Error / Notice Banner */}
      {metaError && (
        <Alert
          type={metaError.code.includes("AUTH") ? "error" : "warning"}
          showIcon
          icon={metaError.code.includes("AUTH") ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>
                {metaError.code === "META_AUTH_EXPIRED"
                  ? "Meta WhatsApp Access Token Expired"
                  : metaError.code === "META_AUTH_INVALID"
                  ? "Invalid Meta Access Token"
                  : metaError.code === "META_PERMISSION_DENIED"
                  ? "Meta Permission Denied"
                  : metaError.code === "META_CREDENTIALS_MISSING"
                  ? "Meta Credentials Missing"
                  : "Meta Graph API Notice"}
              </span>
              <span style={{ fontSize: 13, color: "var(--wa-text-secondary)" }}>
                {metaError.message}
              </span>
              {metaError.code === "META_AUTH_EXPIRED" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>
                    Generate a permanent System User Token in your Meta Business Suite, and update <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>WHATSAPP_ACCESS_TOKEN</code>.
                  </span>
                  <Link href="/setup-guide">
                    <Button size="small" type="primary" style={{ backgroundColor: "var(--wa-primary)" }}>
                      View Meta Setup Guide
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          }
          closable
          onClose={() => setMetaError(null)}
        />
      )}

      {/* Filter Bar */}
      <div className={`glass-panel ${styles.filterBar}`}>
        <div className={styles.searchBox}>
          <Input
            prefix={<Search size={15} style={{ color: "var(--wa-text-secondary)", marginRight: 6 }} />}
            placeholder="Search display phone numbers, IDs, names, or WABA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input"
            allowClear
          />
        </div>
        <div className={styles.filterGroup}>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Filter Project:</span>
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            style={{ width: 220 }}
            options={[
              { value: "all", label: "All Numbers (Assigned & Unassigned)" },
              { value: "unassigned", label: "⚠️ Unassigned Numbers Only" },
              ...projects.map((p) => ({ value: p.projectId, label: p.name })),
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className={`glass-panel ${styles.tableWrapper}`}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="phoneNumberId"
          loading={isLoading}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{
            emptyText: (
              <div style={{ padding: "32px 16px" }}>
                <Empty
                  description={
                    <div style={{ maxWidth: 450, margin: "0 auto", textAlign: "center" }}>
                      <p style={{ fontWeight: 600, color: "var(--wa-text-primary)", marginBottom: 4 }}>
                        No WhatsApp Phone Numbers Found
                      </p>
                      <p style={{ fontSize: 13, color: "var(--wa-text-secondary)" }}>
                        Click <strong>Register New Number</strong> above to add and verify a real phone number via Meta Graph API v25.0.
                      </p>
                    </div>
                  }
                />
              </div>
            ),
          }}
        />
      </div>

      {/* Project Assignment Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderGit2 size={18} color="#075E54" />
            <span>Assign Phone Number to Internal Project</span>
          </div>
        }
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setSelectedPhone(null);
        }}
        footer={null}
        destroyOnClose
      >
        {selectedPhone && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
            <div style={{ padding: "12px", background: "var(--wa-bg-light)", borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--wa-text-secondary)" }}>Phone Number:</span>
                <span style={{ fontWeight: 600, color: "var(--wa-text-primary)" }}>{selectedPhone.displayPhoneNumber}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--wa-text-secondary)" }}>Phone Number ID:</span>
                <span style={{ fontFamily: "monospace", color: "var(--wa-text-primary)" }}>{selectedPhone.phoneNumberId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--wa-text-secondary)" }}>Current Project:</span>
                <span style={{ fontWeight: 500, color: selectedPhone.projectName ? "var(--wa-primary)" : "var(--wa-text-muted)" }}>
                  {selectedPhone.projectName || "None (Unassigned)"}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--wa-text-primary)", marginBottom: 6 }}>
                Select Internal Project:
              </label>
              <Select
                value={targetProjectId}
                onChange={setTargetProjectId}
                placeholder="Select an internal project"
                style={{ width: "100%" }}
                options={[
                  { value: null, label: "— Unassign (No Project Mapping) —" },
                  ...projects.map((p) => ({ value: p.projectId, label: p.name })),
                ]}
              />
              <span style={{ display: "block", fontSize: 11, color: "var(--wa-text-muted)", marginTop: 6 }}>
                Project mappings are stored in MSSQL (<code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 4 }}>WA_PROJECT_MAPPINGS</code>) and preserved across Meta Graph API synchronizations.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              <Button onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="primary"
                loading={isAssigning}
                onClick={() => handleAssignProject(selectedPhone.phoneNumberId, targetProjectId)}
                style={{ backgroundColor: "var(--wa-primary)" }}
              >
                Save Assignment
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Register & Configure WhatsApp Phone Number Modal (3-Step Wizard + Import Tab) */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={18} color="#075E54" />
            <span>Register & Configure WhatsApp Phone Number</span>
          </div>
        }
        open={registerModalOpen}
        onCancel={closeWizard}
        footer={null}
        destroyOnClose
        width={620}
      >
        <Tabs
          activeKey={modalTab}
          onChange={(key) => {
            setModalTab(key as "wizard" | "import");
            setStepError(null);
          }}
          items={[
            {
              key: "wizard",
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Plus size={14} />
                  <span>Onboard New Number</span>
                </span>
              ),
              children: (
                <div className={styles.wizardContainer}>
                  {/* Slim Progress Indicator */}
                  <div className={styles.wizardSteps}>
                    <Steps
                      size="small"
                      current={currentStep}
                      items={[
                        { title: "1. Number" },
                        { title: "2. Verify" },
                        { title: "3. Finish" },
                      ]}
                    />
                  </div>

                  {/* Inline Step Error */}
                  {stepError && (
                    <Alert
                      type="error"
                      showIcon
                      message={stepError}
                      closable
                      onClose={() => setStepError(null)}
                      style={{ fontSize: 13 }}
                    />
                  )}

                  {/* STEP 1: Country Code + Phone Number + Verified Name + Delivery Method */}
                  {currentStep === 0 && (
                    <div className={styles.stepCard}>
                      <Form
                        form={step1Form}
                        layout="vertical"
                        onFinish={handleStep1Submit}
                        initialValues={{ cc: "1", method: "SMS", language: "en_US" }}
                      >
                        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
                          <Form.Item
                            name="cc"
                            label="Country Code"
                            rules={[{ required: true, message: "Required" }]}
                            extra="Select or type code"
                          >
                            <Select
                              showSearch
                              placeholder="Code"
                              options={COMMON_COUNTRY_CODES}
                              filterOption={(input, option) =>
                                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                              }
                            />
                          </Form.Item>

                          <Form.Item
                            name="phoneNumber"
                            label="Phone Number"
                            rules={[
                              { required: true, message: "Phone number is required." },
                              { pattern: /^\d{4,15}$/, message: "Must be 4 to 15 digits (E.164, digits only)." },
                            ]}
                            extra="National number without leading zero or spaces"
                          >
                            <Input placeholder="5551234567" maxLength={15} />
                          </Form.Item>
                        </div>

                        <Form.Item
                          name="verifiedName"
                          label="Verified Sender Name"
                          rules={[
                            { required: true, message: "Verified sender name is required." },
                            { min: 2, message: "Name must be at least 2 characters." },
                          ]}
                          extra="Name displayed to customers on WhatsApp (must match business guidelines)"
                        >
                          <Input placeholder="e.g. Apex Support Desk" />
                        </Form.Item>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
                          <Form.Item
                            name="method"
                            label="Verification Delivery Method"
                            rules={[{ required: true }]}
                            extra="How Meta delivers the 6-digit code"
                          >
                            <Radio.Group>
                              <Radio value="SMS">SMS Text Message</Radio>
                              <Radio value="VOICE">Voice Call</Radio>
                            </Radio.Group>
                          </Form.Item>

                          <Form.Item
                            name="language"
                            label="Language"
                            extra="ISO code"
                          >
                            <Select
                              options={[
                                { value: "en_US", label: "en_US (English)" },
                                { value: "en_GB", label: "en_GB (UK)" },
                                { value: "es_ES", label: "es_ES (Spanish)" },
                                { value: "hi_IN", label: "hi_IN (Hindi)" },
                                { value: "pt_BR", label: "pt_BR (Portuguese)" },
                                { value: "fr_FR", label: "fr_FR (French)" },
                                { value: "de_DE", label: "de_DE (German)" },
                                { value: "ar_AR", label: "ar_AR (Arabic)" },
                              ]}
                            />
                          </Form.Item>
                        </div>

                        <div className={styles.stepActions}>
                          <Button onClick={closeWizard} disabled={isSubmittingStep}>
                            Cancel
                          </Button>
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={isSubmittingStep}
                            icon={<Send size={14} />}
                            style={{ backgroundColor: "var(--wa-primary)" }}
                          >
                            Send Code
                          </Button>
                        </div>
                      </Form>
                    </div>
                  )}

                  {/* STEP 2: Verify 6-digit Code */}
                  {currentStep === 1 && (
                    <div className={styles.stepCard}>
                      <div className={styles.readOnlyCard}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <CheckCircle2 size={16} color="#075E54" />
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)" }}>
                            Verification Code Sent
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--wa-text-secondary)" }}>
                          Sent via <strong>{wizardMethod}</strong> to{" "}
                          <span style={{ fontWeight: 600, color: "var(--wa-text-primary)", fontFamily: "monospace" }}>
                            {wizardDisplayPhone}
                          </span>
                        </div>
                      </div>

                      <Form form={step2Form} layout="vertical" onFinish={handleStep2Submit}>
                        <Form.Item
                          name="code"
                          label="6-Digit Verification Code"
                          rules={[
                            { required: true, message: "Please enter the 6-digit code received from Meta." },
                            { pattern: /^\d{6}$/, message: "Code must be exactly 6 numeric digits." },
                          ]}
                          extra="Enter the 6 digits sent via SMS or Voice call"
                        >
                          <Input
                            maxLength={6}
                            placeholder="123456"
                            style={{
                              fontFamily: "monospace",
                              fontSize: 22,
                              letterSpacing: 10,
                              textAlign: "center",
                              maxWidth: 240,
                              margin: "0 auto",
                              display: "block",
                            }}
                          />
                        </Form.Item>

                        <div className={styles.resendSection}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--wa-text-secondary)" }}>
                            <Clock size={14} />
                            {resendCountdown > 0 ? (
                              <span>Resend code available in <strong>{resendCountdown}s</strong></span>
                            ) : (
                              <span>Didn’t receive the code?</span>
                            )}
                          </div>
                          <Button
                            size="small"
                            onClick={handleResendCode}
                            disabled={resendCountdown > 0 || isSubmittingStep}
                            loading={isSubmittingStep && resendCountdown === 0}
                          >
                            Resend Code
                          </Button>
                        </div>

                        <div className={styles.stepActions}>
                          <Button onClick={() => setCurrentStep(0)} disabled={isSubmittingStep}>
                            Back to Number
                          </Button>
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={isSubmittingStep}
                            icon={<ShieldCheck size={14} />}
                            style={{ backgroundColor: "var(--wa-primary)" }}
                          >
                            Verify
                          </Button>
                        </div>
                      </Form>
                    </div>
                  )}

                  {/* STEP 3: 6-digit Two-Step Verification PIN, Project Assignment, Default Sender */}
                  {currentStep === 2 && (
                    <div className={styles.stepCard}>
                      <div className={styles.readOnlyCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Phone Number:</span>
                          <span style={{ fontWeight: 600, color: "var(--wa-text-primary)", fontFamily: "monospace" }}>
                            {wizardDisplayPhone || wizardPhoneId}
                          </span>
                        </div>
                        {wizardVerifiedName && (
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Sender Name:</span>
                            <span style={{ fontWeight: 500, color: "var(--wa-text-primary)" }}>{wizardVerifiedName}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Meta Phone ID:</span>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--wa-text-muted)" }}>
                            {wizardPhoneId}
                          </span>
                        </div>
                      </div>

                      <Form
                        form={step3Form}
                        layout="vertical"
                        onFinish={handleStep3Submit}
                        initialValues={{ isDefault: false }}
                      >
                        <Form.Item
                          name="pin"
                          label="6-Digit Two-Step Verification PIN"
                          rules={[
                            { required: true, message: "Please set or enter your 6-digit registration PIN." },
                            { pattern: /^\d{6}$/, message: "PIN must be exactly 6 digits." },
                          ]}
                          extra="Set a 6-digit numeric PIN for WhatsApp Cloud API two-step verification."
                        >
                          <Input.Password
                            maxLength={6}
                            placeholder="123456"
                            style={{ fontFamily: "monospace", letterSpacing: 6, fontSize: 16 }}
                          />
                        </Form.Item>

                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "center" }}>
                          <Form.Item
                            name="projectId"
                            label="Assign to Project (Optional)"
                            extra="Map to an internal project in engine"
                          >
                            <Select
                              placeholder="Select project"
                              allowClear
                              options={[
                                { value: null, label: "— No Project (Unassigned) —" },
                                ...projects.map((p) => ({ value: p.projectId, label: p.name })),
                              ]}
                            />
                          </Form.Item>

                          <Form.Item
                            name="isDefault"
                            label="Default Sender"
                            valuePropName="checked"
                            extra="Primary sender for engine"
                          >
                            <Switch checkedChildren="Yes" unCheckedChildren="No" />
                          </Form.Item>
                        </div>

                        <div className={styles.stepActions}>
                          <Button onClick={() => setCurrentStep(1)} disabled={isSubmittingStep}>
                            Back to Verify
                          </Button>
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={isSubmittingStep}
                            icon={<CheckCircle2 size={14} />}
                            style={{ backgroundColor: "var(--wa-primary)" }}
                          >
                            Register & Save
                          </Button>
                        </div>
                      </Form>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "import",
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Building2 size={14} />
                  <span>Import Existing (WABA)</span>
                </span>
              ),
              children: (
                <div className={styles.wizardContainer}>
                  {stepError && (
                    <Alert
                      type="error"
                      showIcon
                      message={stepError}
                      closable
                      onClose={() => setStepError(null)}
                      style={{ fontSize: 13 }}
                    />
                  )}

                  <div className={styles.stepCard}>
                    <Form
                      form={importForm}
                      layout="vertical"
                      onFinish={handleImportSubmit}
                      initialValues={{ isDefault: false }}
                    >
                      <Form.Item
                        name="phoneNumberId"
                        label="Meta Phone Number ID"
                        rules={[{ required: true, message: "Please select or provide a Phone Number ID." }]}
                        extra="Select an existing number discovered from Meta or enter Phone Number ID"
                      >
                        <Select
                          showSearch
                          placeholder="Select or enter Phone Number ID"
                          options={numbers.map((n) => ({
                            value: n.phoneNumberId,
                            label: `${n.displayPhoneNumber || n.phoneNumberId} (${n.verifiedName || "Unverified"}) - ${n.phoneNumberId}`,
                          }))}
                          filterOption={(input, option) =>
                            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                          }
                          notFoundContent={
                            <div style={{ padding: "8px 12px" }}>
                              <Input
                                placeholder="Or enter custom Phone Number ID"
                                onChange={(e) => importForm.setFieldsValue({ phoneNumberId: e.target.value })}
                              />
                            </div>
                          }
                        />
                      </Form.Item>

                      <Form.Item
                        name="pin"
                        label="6-Digit Two-Step Verification PIN"
                        rules={[
                          { required: true, message: "Please enter your 6-digit PIN." },
                          { pattern: /^\d{6}$/, message: "PIN must be exactly 6 digits." },
                        ]}
                        extra="The 6-digit registration PIN set in Meta WhatsApp Business Manager"
                      >
                        <Input.Password
                          maxLength={6}
                          placeholder="123456"
                          style={{ fontFamily: "monospace", letterSpacing: 6, fontSize: 16 }}
                        />
                      </Form.Item>

                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "center" }}>
                        <Form.Item
                          name="projectId"
                          label="Assign to Project (Optional)"
                          extra="Map to an internal project"
                        >
                          <Select
                            placeholder="Select project"
                            allowClear
                            options={[
                              { value: null, label: "— No Project (Unassigned) —" },
                              ...projects.map((p) => ({ value: p.projectId, label: p.name })),
                            ]}
                          />
                        </Form.Item>

                        <Form.Item
                          name="isDefault"
                          label="Default Sender"
                          valuePropName="checked"
                          extra="Use as primary number"
                        >
                          <Switch checkedChildren="Yes" unCheckedChildren="No" />
                        </Form.Item>
                      </div>

                      <div className={styles.stepActions}>
                        <Button onClick={closeWizard} disabled={isSubmittingStep}>
                          Cancel
                        </Button>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={isSubmittingStep}
                          style={{ backgroundColor: "var(--wa-primary)" }}
                        >
                          Register & Save
                        </Button>
                      </div>
                    </Form>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
