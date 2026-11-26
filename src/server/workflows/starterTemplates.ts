import { WorkflowGraph } from "./types";

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: "keyword" | "any_reply" | "first_message";
  triggerValue: string;
  graph: WorkflowGraph;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "order_status",
    name: "Order Status Lookup",
    description: "Asks customer for their Order ID and calls an order lookup API endpoint.",
    triggerType: "keyword",
    triggerValue: "ORDER, STATUS, TRACK",
    graph: {
      nodes: [
        {
          id: "trig_1",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "ORDER, STATUS, TRACK", description: "Triggered on order keywords" },
        },
        {
          id: "ask_order_id",
          type: "ask",
          position: { x: 250, y: 180 },
          data: {
            text: "Hello! Please reply with your 6-digit Order ID to check your order status.",
            var: "order_id",
            kind: "text",
          },
        },
        {
          id: "api_lookup",
          type: "api",
          position: { x: 250, y: 320 },
          data: {
            url: "https://api.example.com/orders/{{order_id}}",
            method: "GET",
            save: "order",
          },
        },
        {
          id: "msg_success",
          type: "message",
          position: { x: 100, y: 470 },
          data: {
            text: "Great news! Your order #{{order_id}} is {{order.status}} with estimated delivery: {{order.delivery_date}}.",
          },
        },
        {
          id: "msg_error",
          type: "message",
          position: { x: 420, y: 470 },
          data: {
            text: "Sorry, we could not find order #{{order_id}}. Please check your number and try again.",
          },
        },
        {
          id: "end_flow",
          type: "end",
          position: { x: 250, y: 620 },
          data: { text: "Thank you for shopping with us!" },
        },
      ],
      edges: [
        { from: "trig_1", port: "next", to: "ask_order_id" },
        { from: "ask_order_id", port: "next", to: "api_lookup" },
        { from: "api_lookup", port: "success", to: "msg_success" },
        { from: "api_lookup", port: "error", to: "msg_error" },
        { from: "msg_success", port: "next", to: "end_flow" },
        { from: "msg_error", port: "next", to: "end_flow" },
      ],
    },
  },
  {
    id: "lead_capture",
    name: "Lead Capture",
    description: "Captures customer name and email address step-by-step.",
    triggerType: "keyword",
    triggerValue: "DEMO, JOIN, INFO, START",
    graph: {
      nodes: [
        {
          id: "trig_lead",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "DEMO, JOIN, INFO, START" },
        },
        {
          id: "ask_name",
          type: "ask",
          position: { x: 250, y: 180 },
          data: {
            text: "Welcome to WA Engine! May I know your full name?",
            var: "customer_name",
            kind: "text",
          },
        },
        {
          id: "ask_email",
          type: "ask",
          position: { x: 250, y: 320 },
          data: {
            text: "Nice to meet you, {{customer_name}}! What is your email address so we can send the details?",
            var: "customer_email",
            kind: "email",
          },
        },
        {
          id: "msg_confirm",
          type: "message",
          position: { x: 250, y: 460 },
          data: {
            text: "Thanks {{customer_name}}! We've registered {{customer_email}} and our team will get in touch shortly.",
          },
        },
        {
          id: "end_lead",
          type: "end",
          position: { x: 250, y: 600 },
          data: { text: "Have a wonderful day!" },
        },
      ],
      edges: [
        { from: "trig_lead", port: "next", to: "ask_name" },
        { from: "ask_name", port: "next", to: "ask_email" },
        { from: "ask_email", port: "next", to: "msg_confirm" },
        { from: "msg_confirm", port: "next", to: "end_lead" },
      ],
    },
  },
  {
    id: "support_menu",
    name: "Support Menu",
    description: "Interactive button menu directing customers to sales, support, or billing.",
    triggerType: "first_message",
    triggerValue: "",
    graph: {
      nodes: [
        {
          id: "trig_menu",
          type: "trigger",
          position: { x: 300, y: 50 },
          data: { keyword: "HI, HELLO, MENU, HELP" },
        },
        {
          id: "btn_menu",
          type: "buttons",
          position: { x: 300, y: 180 },
          data: {
            text: "Hi there! How can our team assist you today?",
            opts: [
              { id: "opt_sales", title: "Sales Enquiry" },
              { id: "opt_support", title: "Tech Support" },
              { id: "opt_billing", title: "Billing & Plans" },
            ],
          },
        },
        {
          id: "msg_sales",
          type: "message",
          position: { x: 80, y: 350 },
          data: {
            text: "Our Sales team is ready to help you choose the best plan. An agent will respond in 2 minutes.",
          },
        },
        {
          id: "msg_support",
          type: "message",
          position: { x: 300, y: 350 },
          data: {
            text: "Our Support specialists are on standby. Please reply with details of your issue.",
          },
        },
        {
          id: "msg_billing",
          type: "message",
          position: { x: 520, y: 350 },
          data: {
            text: "For invoices and payment questions, you can also view your portal at https://wa-engine.com/billing",
          },
        },
        {
          id: "end_menu",
          type: "end",
          position: { x: 300, y: 500 },
          data: { text: "We're here 24/7 if you need anything else." },
        },
      ],
      edges: [
        { from: "trig_menu", port: "next", to: "btn_menu" },
        { from: "btn_menu", port: "opt_sales", to: "msg_sales" },
        { from: "btn_menu", port: "opt_support", to: "msg_support" },
        { from: "btn_menu", port: "opt_billing", to: "msg_billing" },
        { from: "msg_sales", port: "next", to: "end_menu" },
        { from: "msg_support", port: "next", to: "end_menu" },
        { from: "msg_billing", port: "next", to: "end_menu" },
      ],
    },
  },
  {
    id: "appointments",
    name: "Appointments",
    description: "Books, reschedules and cancels visits for patients, children and other adults, with a waiting list and optional deposit.",
    triggerType: "keyword",
    triggerValue: "BOOK, APPOINTMENT, VISIT, SCHEDULE, RESCHEDULE, CANCEL",
    graph: {
      nodes: [
        {
          id: "trig_app",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "BOOK, APPOINTMENT, VISIT, SCHEDULE", description: "Appointment booking & rescheduling" },
        },
        {
          id: "btn_app_type",
          type: "buttons",
          position: { x: 250, y: 180 },
          data: {
            text: "Welcome to the Clinic. How can we help you with your appointment today?",
            opts: [
              { id: "opt_book_new", title: "Book Visit" },
              { id: "opt_resched", title: "Reschedule" },
              { id: "opt_cancel", title: "Cancel Visit" },
            ],
          },
        },
        {
          id: "ask_patient_name",
          type: "ask",
          position: { x: 100, y: 340 },
          data: { text: "Please provide the patient's full name:", var: "patient_name", kind: "text" },
        },
        {
          id: "msg_resched_info",
          type: "message",
          position: { x: 380, y: 340 },
          data: { text: "To reschedule, please reply with your current appointment reference number." },
        },
        {
          id: "end_app",
          type: "end",
          position: { x: 250, y: 500 },
          data: { text: "Thank you! We look forward to seeing you at the clinic." },
        },
      ],
      edges: [
        { from: "trig_app", port: "next", to: "btn_app_type" },
        { from: "btn_app_type", port: "opt_book_new", to: "ask_patient_name" },
        { from: "btn_app_type", port: "opt_resched", to: "msg_resched_info" },
        { from: "btn_app_type", port: "opt_cancel", to: "msg_resched_info" },
        { from: "ask_patient_name", port: "next", to: "end_app" },
        { from: "msg_resched_info", port: "next", to: "end_app" },
      ],
    },
  },
  {
    id: "registration",
    name: "Registration",
    description: "Registers new patients: name, date of birth, language, consent and insurance, saving nothing until they agree.",
    triggerType: "keyword",
    triggerValue: "REGISTER, NEW PATIENT, SIGNUP",
    graph: {
      nodes: [
        {
          id: "trig_reg",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "REGISTER, NEW PATIENT, SIGNUP" },
        },
        {
          id: "ask_reg_name",
          type: "ask",
          position: { x: 250, y: 180 },
          data: { text: "Welcome! To register as a new patient, please reply with your legal full name:", var: "patient_name", kind: "text" },
        },
        {
          id: "ask_reg_dob",
          type: "ask",
          position: { x: 250, y: 320 },
          data: { text: "Thank you {{patient_name}}. What is your date of birth (DD/MM/YYYY)?", var: "patient_dob", kind: "text" },
        },
        {
          id: "end_reg",
          type: "end",
          position: { x: 250, y: 460 },
          data: { text: "Registration complete! Your patient ID has been generated." },
        },
      ],
      edges: [
        { from: "trig_reg", port: "next", to: "ask_reg_name" },
        { from: "ask_reg_name", port: "next", to: "ask_reg_dob" },
        { from: "ask_reg_dob", port: "next", to: "end_reg" },
      ],
    },
  },
  {
    id: "returning_patients",
    name: "Returning patients",
    description: "Quick rebooking, profile updates and answers to chronic-care check-up reminders.",
    triggerType: "keyword",
    triggerValue: "REBOOK, CHECKUP, RETURNING",
    graph: {
      nodes: [
        {
          id: "trig_ret",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "REBOOK, CHECKUP, RETURNING" },
        },
        {
          id: "msg_ret",
          type: "message",
          position: { x: 250, y: 180 },
          data: { text: "Welcome back! We found your active record. Ready for your periodic check-up?" },
        },
        {
          id: "end_ret",
          type: "end",
          position: { x: 250, y: 320 },
          data: { text: "Your checkup has been prioritized." },
        },
      ],
      edges: [
        { from: "trig_ret", port: "next", to: "msg_ret" },
        { from: "msg_ret", port: "next", to: "end_ret" },
      ],
    },
  },
  {
    id: "pre_visit_intake",
    name: "Pre-visit intake",
    description: "Collects demographics, reason, symptoms, medications, insurance and consent before the visit, and resumes where it stopped.",
    triggerType: "keyword",
    triggerValue: "INTAKE, SYMPTOMS, PREVISIT",
    graph: {
      nodes: [
        {
          id: "trig_intake",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "INTAKE, SYMPTOMS, PREVISIT" },
        },
        {
          id: "ask_symptoms",
          type: "ask",
          position: { x: 250, y: 180 },
          data: { text: "Please describe the primary reason or symptoms for your upcoming doctor consultation:", var: "symptoms", kind: "text" },
        },
        {
          id: "end_intake",
          type: "end",
          position: { x: 250, y: 320 },
          data: { text: "Your intake notes have been securely transferred to the doctor's chart." },
        },
      ],
      edges: [
        { from: "trig_intake", port: "next", to: "ask_symptoms" },
        { from: "ask_symptoms", port: "next", to: "end_intake" },
      ],
    },
  },
  {
    id: "waiting_list",
    name: "Waiting list",
    description: "Adds patients to the waiting list and handles accept or decline of an opened slot.",
    triggerType: "keyword",
    triggerValue: "WAITLIST, QUEUE, STANDBY",
    graph: {
      nodes: [
        {
          id: "trig_wait",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "WAITLIST, QUEUE, STANDBY" },
        },
        {
          id: "msg_wait",
          type: "message",
          position: { x: 250, y: 180 },
          data: { text: "You have been placed on our priority standby waiting list. You will be alerted the moment an earlier slot opens!" },
        },
        {
          id: "end_wait",
          type: "end",
          position: { x: 250, y: 320 },
          data: { text: "Stay tuned for instant slot notifications." },
        },
      ],
      edges: [
        { from: "trig_wait", port: "next", to: "msg_wait" },
        { from: "msg_wait", port: "next", to: "end_wait" },
      ],
    },
  },
  {
    id: "payments",
    name: "Payments",
    description: "Answers payment questions: how to pay, receipts, balances and refunds. The clinic's rules decide the reply.",
    triggerType: "keyword",
    triggerValue: "PAY, PAYMENT, BILL, RECEIPT, BALANCE",
    graph: {
      nodes: [
        {
          id: "trig_pay",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "PAY, PAYMENT, BILL, RECEIPT, BALANCE" },
        },
        {
          id: "btn_pay",
          type: "buttons",
          position: { x: 250, y: 180 },
          data: {
            text: "Clinic Billing & Payments Assistant. Please select your enquiry:",
            opts: [
              { id: "opt_pay_link", title: "Pay Online" },
              { id: "opt_receipt", title: "Get Receipt" },
              { id: "opt_balance", title: "Check Balance" },
            ],
          },
        },
        {
          id: "end_pay",
          type: "end",
          position: { x: 250, y: 340 },
          data: { text: "Payments are processed securely via 256-bit encrypted healthcare gateways." },
        },
      ],
      edges: [
        { from: "trig_pay", port: "next", to: "btn_pay" },
        { from: "btn_pay", port: "opt_pay_link", to: "end_pay" },
        { from: "btn_pay", port: "opt_receipt", to: "end_pay" },
        { from: "btn_pay", port: "opt_balance", to: "end_pay" },
      ],
    },
  },
  {
    id: "labs_imaging",
    name: "Labs & imaging",
    description: "Test requests with the server-side safety checks, sample collection choice and results-review follow-ups.",
    triggerType: "keyword",
    triggerValue: "LAB, TEST, REPORT, SCAN, XRAY, BLOOD",
    graph: {
      nodes: [
        {
          id: "trig_lab",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "LAB, TEST, REPORT, SCAN, XRAY, BLOOD" },
        },
        {
          id: "msg_lab",
          type: "message",
          position: { x: 250, y: 180 },
          data: { text: "Lab & Diagnostic Reports: Please enter your 8-digit Lab Reference Number to download verified digital reports." },
        },
        {
          id: "end_lab",
          type: "end",
          position: { x: 250, y: 320 },
          data: { text: "Reports are signed and certified by the Chief Pathologist." },
        },
      ],
      edges: [
        { from: "trig_lab", port: "next", to: "msg_lab" },
        { from: "msg_lab", port: "next", to: "end_lab" },
      ],
    },
  },
];
