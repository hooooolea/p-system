// Police System Types

export interface AlertItem {
  id: string;
  type: 'critical' | 'warning' | 'normal' | 'info';
  title: string;
  description: string;
  location: string;
  timestamp: string;
  status: 'pending' | 'processing' | 'resolved';
}

export interface CaseItem {
  id: string;
  caseNo: string;
  type: string;
  description: string;
  location: string;
  riskLevel: 'high' | 'medium' | 'low';
  status: 'new' | 'assigned' | 'processing' | 'closed';
  createTime: string;
  assignee?: string;
}

export interface TargetItem {
  id: string;
  name: string;
  type: 'person' | 'vehicle' | 'object';
  features: string[];
  riskLevel: 'high' | 'medium' | 'low';
  status: 'active' | 'inactive' | 'captured';
  lastSeen?: string;
  lastLocation?: string;
  photoUrl?: string;
}

export interface VideoItem {
  id: string;
  cameraId: string;
  cameraName: string;
  location: string;
  timestamp: string;
  thumbnailUrl: string;
  detectedObjects: DetectedObject[];
}

export interface DetectedObject {
  type: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface AnalysisResult {
  id: string;
  query: string;
  result: string;
  confidence: number;
  relatedCases: string[];
  relatedVideos: string[];
  timestamp: string;
}

export interface DashboardStats {
  totalAlerts: number;
  pendingCases: number;
  activeTargets: number;
  onlineCameras: number;
  alertTrend: number;
  caseTrend: number;
  targetTrend: number;
  cameraTrend: number;
}

export interface RiskAssessment {
  level: 'high' | 'medium' | 'low';
  score: number;
  factors: string[];
  suggestion: string;
}

export interface SemanticAnalysis {
  originalText: string;
  normalizedText: string;
  intent: string;
  entities: Entity[];
  riskAssessment: RiskAssessment;
}

export interface Entity {
  type: string;
  value: string;
  start: number;
  end: number;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  department: string;
  avatar?: string;
}

export interface Notification {
  id: string;
  type: 'alert' | 'case' | 'target' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
