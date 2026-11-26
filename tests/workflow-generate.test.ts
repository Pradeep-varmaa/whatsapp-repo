import {
  generateWorkflowFromTemplate,
  generateWorkflowFromPrompt,
  generateHeuristicGraph,
} from "../src/server/workflows/generate";
import { validateGraph } from "../src/server/workflows/validation";
import { STARTER_TEMPLATES } from "../src/server/workflows/starterTemplates";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=== Running Task 3: Workflow Generation Unit Tests ===\n");

  // --------------------------------------------------------------------------
  // Test 1: Template-based generation with parameter interpolation
  // --------------------------------------------------------------------------
  {
    console.log("Testing template-based generation with parameters...");
    const result = generateWorkflowFromTemplate({
      templateId: "appointments",
      name: "Downtown Dental Clinic - Bookings",
      parameters: {
        businessName: "Downtown Dental Clinic",
        keywords: "DENTAL, APPOINTMENT, VISIT",
      },
    });

    assert(result.success === true, "Template generation should succeed");
    assert(result.name === "Downtown Dental Clinic - Bookings", "Custom name applied");
    assert(result.triggerValue === "DENTAL, APPOINTMENT, VISIT", "Keywords parameter interpolated");

    // Check unique node IDs
    const templateOriginal = STARTER_TEMPLATES.find((t) => t.id === "appointments")!;
    const origNodeIds = new Set(templateOriginal.graph.nodes.map((n) => n.id));
    for (const node of result.graph.nodes) {
      assert(!origNodeIds.has(node.id), `Generated node ID "${node.id}" should be unique and distinct from template`);
    }

    // Check parameter replacement in message text
    const welcomeNode = result.graph.nodes.find((n) => n.type === "buttons");
    assert(
      welcomeNode?.data?.text?.includes("Downtown Dental Clinic"),
      "Business name should be interpolated into button text"
    );

    // Validate graph structure with validateGraph
    const validation = validateGraph(result.graph);
    assert(validation.valid === true, `Generated template graph must pass validateGraph: ${validation.errors.join(", ")}`);
    console.log("✔ Template generation and parameter interpolation tests passed");
  }

  // --------------------------------------------------------------------------
  // Test 2: Prompt-based generation (Appointment Booking with Date)
  // --------------------------------------------------------------------------
  {
    console.log("Testing prompt generation for appointment booking with date picker...");
    const result = await generateWorkflowFromPrompt({
      prompt: "Create an appointment booking agent with calendar date selector and time slots",
      name: "Auto Dental Booking",
    });

    assert(result.success === true, "Prompt generation should succeed");
    assert(result.name === "Auto Dental Booking", "Prompt name assigned");

    // Must contain an ask node with kind="date"
    const dateAskNode = result.graph.nodes.find((n) => n.type === "ask" && n.data?.kind === "date");
    assert(dateAskNode !== undefined, "Prompt generation for booking should include an ask node with kind 'date'");
    assert(dateAskNode?.data?.var === "selected_date", "Ask date node variable name should be 'selected_date'");

    // Must validate cleanly with validateGraph
    const validation = validateGraph(result.graph);
    assert(validation.valid === true, `Generated graph must pass validateGraph: ${validation.errors.join(", ")}`);
    console.log("✔ Prompt generation with date validation kind passed");
  }

  // --------------------------------------------------------------------------
  // Test 3: Prompt-based generation (Feedback Survey)
  // --------------------------------------------------------------------------
  {
    console.log("Testing prompt generation for customer feedback survey...");
    const result = await generateWorkflowFromPrompt({
      prompt: "Create a customer feedback survey that asks for a rating from 1 to 5 and comments",
    });

    assert(result.success === true, "Feedback survey generation should succeed");
    const buttonsNode = result.graph.nodes.find((n) => n.type === "buttons");
    assert(buttonsNode !== undefined, "Feedback survey should contain buttons node for rating");

    const validation = validateGraph(result.graph);
    assert(validation.valid === true, `Feedback survey must pass validateGraph: ${validation.errors.join(", ")}`);
    console.log("✔ Prompt generation for feedback survey passed");
  }

  // --------------------------------------------------------------------------
  // Test 4: Prompt-based generation (API lookup with success & error branches)
  // --------------------------------------------------------------------------
  {
    console.log("Testing prompt generation for API order lookup...");
    const result = await generateWorkflowFromPrompt({
      prompt: "Create an order status tracker that looks up the order id from an API",
    });

    assert(result.success === true, "Order lookup generation should succeed");
    const apiNode = result.graph.nodes.find((n) => n.type === "api");
    assert(apiNode !== undefined, "Order lookup should contain api node");

    // Verify both success and error edges exist
    const apiEdges = result.graph.edges.filter((e) => e.from === apiNode!.id);
    const ports = apiEdges.map((e) => e.port);
    assert(ports.includes("success"), "API node must have a success edge");
    assert(ports.includes("error"), "API node must have an error edge");

    const validation = validateGraph(result.graph);
    assert(validation.valid === true, `API graph must pass validateGraph: ${validation.errors.join(", ")}`);
    console.log("✔ Prompt generation for API workflow passed");
  }

  // --------------------------------------------------------------------------
  // Test 5: Validation enforcement and rejection of unrepairable invalid graphs
  // --------------------------------------------------------------------------
  {
    console.log("Testing validation enforcement on invalid graph...");
    const brokenGraph = {
      nodes: [
        { id: "trig", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "HI" } },
        { id: "broken_ask", type: "ask", position: { x: 0, y: 100 }, data: { text: "Date?", var: "date", kind: "invalid_kind" as any } },
      ],
      edges: [
        { id: "e1", from: "trig", port: "next", to: "broken_ask" },
        // broken_ask has no outgoing edge!
      ],
    };

    const validation = validateGraph(brokenGraph as any);
    assert(validation.valid === false, "Broken graph must fail validateGraph");
    assert(validation.errors.some((e) => e.includes("Invalid option")), "Should catch invalid ask kind");
    assert(validation.errors.some((e) => e.includes("port is not connected")), "Should catch missing outgoing port");
    console.log("✔ Validation correctly catches invalid ask kind and missing ports");
  }

  console.log("\n🎉 ALL TASK 3 GENERATE TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
