import { TriggerNode } from "./TriggerNode";
import { MessageNode } from "./MessageNode";
import { ButtonsNode } from "./ButtonsNode";
import { ListNode } from "./ListNode";
import { AskNode } from "./AskNode";
import { ApiNode } from "./ApiNode";
import { ConditionNode } from "./ConditionNode";
import { CalculationNode } from "./CalculationNode";
import { EndNode } from "./EndNode";
import { GotoFlowNode } from "../../workflow/nodes/GotoFlowNode";

export const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  buttons: ButtonsNode,
  list: ListNode,
  ask: AskNode,
  api: ApiNode,
  condition: ConditionNode,
  calculation: CalculationNode,
  goto_flow: GotoFlowNode,
  end: EndNode,
};
