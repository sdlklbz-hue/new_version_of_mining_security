/** 工作流 final_status 的中文展示文案。 */
export function formatFinalStatus(status: string): string {
  switch (status) {
    case "HUMAN_REVIEW":
      return "待人工审批";
    case "APPROVE":
      return "已通过";
    case "REJECT":
      return "已驳回";
    default:
      return status;
  }
}
