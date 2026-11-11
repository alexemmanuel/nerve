export interface IncidentWorkflowReport {
  ticketId: string;
  repo: string;
  branch: string;
  filePath: string;
  lineNumber: number;
  summary: string;
  stackTrace: string;
  status: 'Investigating' | 'Testing Fix' | 'PR Merged & Deployed';
  timestamp: string;
  reportedAtIso?: string;
  mergedAtIso?: string;
  architectureBreakdown: {
    serviceLayer: string;
    runtime: string;
    blastRadius: string;
    rootCause: string;
  };
  implementedFix: {
    file: string;
    diff: string;
    author: string;
  };
  systemLogsReport: Array<{
    time: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
    event: string;
    details: string;
  }>;
}
