export interface AgentAction {
  action:
    | 'open_app'
    | 'click_by_text'
    | 'click_by_content_desc'
    | 'click_by_index'
    | 'input_text'
    | 'press_enter'
    | 'scroll'
    | 'wait'
    | 'back'
    | 'complete_task';
  params: Record<string, any>;
  reasoning: string;
}

export interface AgentResult {
  success: boolean;
  message: string;
  steps: number;
}
