import type { 
  AlertItem, 
  CaseItem, 
  TargetItem, 
  VideoItem, 
  AnalysisResult,
  DashboardStats,
  SemanticAnalysis,
  Notification,
  User
} from '@/types';

export const mockUser: User = {
  id: '1',
  username: 'admin',
  name: '张警官',
  role: '高级警员',
  department: '指挥中心',
};

export const mockStats: DashboardStats = {
  totalAlerts: 128,
  pendingCases: 45,
  activeTargets: 23,
  onlineCameras: 1568,
  alertTrend: 12.5,
  caseTrend: -5.2,
  targetTrend: 8.1,
  cameraTrend: 0.3,
};

export const mockAlerts: AlertItem[] = [
  {
    id: '1',
    type: 'critical',
    title: '重点区域人员聚集',
    description: '王府井大街口检测到超过50人聚集，需关注',
    location: '王府井大街',
    timestamp: '2024-01-15 14:32:18',
    status: 'pending',
  },
  {
    id: '2',
    type: 'warning',
    title: '可疑车辆徘徊',
    description: '京A12345在目标区域多次往返',
    location: '朝阳区建国路',
    timestamp: '2024-01-15 14:28:05',
    status: 'processing',
  },
  {
    id: '3',
    type: 'info',
    title: '系统巡检完成',
    description: '所有监控设备运行正常',
    location: '系统',
    timestamp: '2024-01-15 14:00:00',
    status: 'resolved',
  },
  {
    id: '4',
    type: 'critical',
    title: '布控目标出现',
    description: '布控人员李某在火车站被识别',
    location: '北京西站',
    timestamp: '2024-01-15 13:45:22',
    status: 'processing',
  },
  {
    id: '5',
    type: 'warning',
    title: '异常行为检测',
    description: '商场内检测到长时间逗留人员',
    location: '西单大悦城',
    timestamp: '2024-01-15 13:30:15',
    status: 'pending',
  },
];

export const mockCases: CaseItem[] = [
  {
    id: '1',
    caseNo: 'BJ2024011501',
    type: '纠纷',
    description: '邻里噪音纠纷，双方情绪激动',
    location: '海淀区中关村小区',
    riskLevel: 'medium',
    status: 'assigned',
    createTime: '2024-01-15 10:23:00',
    assignee: '王警官',
  },
  {
    id: '2',
    caseNo: 'BJ2024011502',
    type: '盗窃',
    description: '超市商品被盗，价值约2000元',
    location: '朝阳区沃尔玛',
    riskLevel: 'low',
    status: 'processing',
    createTime: '2024-01-15 09:15:00',
    assignee: '李警官',
  },
  {
    id: '3',
    caseNo: 'BJ2024011503',
    type: '滋事',
    description: '酒吧门口发生口角冲突',
    location: '三里屯酒吧街',
    riskLevel: 'high',
    status: 'new',
    createTime: '2024-01-15 14:05:00',
  },
  {
    id: '4',
    caseNo: 'BJ2024011504',
    type: '走失',
    description: '老人在公园走失，穿灰色外套',
    location: '天坛公园',
    riskLevel: 'medium',
    status: 'processing',
    createTime: '2024-01-15 08:30:00',
    assignee: '赵警官',
  },
  {
    id: '5',
    caseNo: 'BJ2024011505',
    type: '交通事故',
    description: '两车剐蹭，无人员伤亡',
    location: '东直门外大街',
    riskLevel: 'low',
    status: 'closed',
    createTime: '2024-01-15 07:45:00',
    assignee: '刘警官',
  },
];

export const mockTargets: TargetItem[] = [
  {
    id: '1',
    name: '李某',
    type: 'person',
    features: ['男', '30岁左右', '身高175cm', '短发', '左臂有纹身'],
    riskLevel: 'high',
    status: 'active',
    lastSeen: '2024-01-15 13:45:22',
    lastLocation: '北京西站北广场',
  },
  {
    id: '2',
    name: '京B56789',
    type: 'vehicle',
    features: ['黑色', '奥迪A6', '后窗贴深色膜'],
    riskLevel: 'medium',
    status: 'active',
    lastSeen: '2024-01-15 12:30:00',
    lastLocation: '国贸桥',
  },
  {
    id: '3',
    name: '王某',
    type: 'person',
    features: ['女', '45岁', '身高160cm', '长发', '戴眼镜'],
    riskLevel: 'low',
    status: 'inactive',
  },
  {
    id: '4',
    name: '京C12345',
    type: 'vehicle',
    features: ['白色', '面包车', '车身有划痕'],
    riskLevel: 'high',
    status: 'active',
    lastSeen: '2024-01-15 11:15:00',
    lastLocation: '望京SOHO',
  },
  {
    id: '5',
    name: '张某',
    type: 'person',
    features: ['男', '28岁', '身高180cm', '微胖', '穿红色外套'],
    riskLevel: 'medium',
    status: 'captured',
    lastSeen: '2024-01-14 16:20:00',
    lastLocation: '西单大悦城',
  },
];

export const mockVideos: VideoItem[] = [
  {
    id: '1',
    cameraId: 'CAM001',
    cameraName: '天安门广场东',
    location: '天安门广场',
    timestamp: '2024-01-15 14:30:00',
    thumbnailUrl: '',
    detectedObjects: [
      { type: 'person', confidence: 0.98, bbox: [100, 200, 150, 300] },
      { type: 'person', confidence: 0.95, bbox: [300, 250, 350, 350] },
    ],
  },
  {
    id: '2',
    cameraId: 'CAM002',
    cameraName: '王府井大街北',
    location: '王府井',
    timestamp: '2024-01-15 14:25:00',
    thumbnailUrl: '',
    detectedObjects: [
      { type: 'person', confidence: 0.97, bbox: [200, 300, 250, 400] },
      { type: 'vehicle', confidence: 0.92, bbox: [400, 350, 600, 450] },
    ],
  },
  {
    id: '3',
    cameraId: 'CAM003',
    cameraName: '西单路口南',
    location: '西单',
    timestamp: '2024-01-15 14:20:00',
    thumbnailUrl: '',
    detectedObjects: [
      { type: 'vehicle', confidence: 0.96, bbox: [150, 280, 350, 380] },
    ],
  },
  {
    id: '4',
    cameraId: 'CAM004',
    cameraName: '北京西站进站口',
    location: '北京西站',
    timestamp: '2024-01-15 14:15:00',
    thumbnailUrl: '',
    detectedObjects: [
      { type: 'person', confidence: 0.99, bbox: [250, 200, 300, 350] },
      { type: 'person', confidence: 0.94, bbox: [400, 220, 450, 370] },
    ],
  },
];

export const mockAnalysisResults: AnalysisResult[] = [
  {
    id: '1',
    query: '查找昨日在王府井出现的可疑人员',
    result: '根据视频分析，发现3名可疑人员在王府井区域长时间逗留，其中1人与布控目标特征匹配度达87%',
    confidence: 0.87,
    relatedCases: ['BJ2024011501'],
    relatedVideos: ['CAM002'],
    timestamp: '2024-01-15 14:00:00',
  },
  {
    id: '2',
    query: '分析近期盗窃案件作案手法',
    result: '通过对比分析，近期5起盗窃案件作案手法相似，疑似同一团伙所为，建议并案侦查',
    confidence: 0.92,
    relatedCases: ['BJ2024011502'],
    relatedVideos: [],
    timestamp: '2024-01-15 13:30:00',
  },
];

export const mockSemanticAnalysis: SemanticAnalysis = {
  originalText: '有人在我家门口吵闹，还砸东西，快来人啊',
  normalizedText: '报警人住所门口发生纠纷，有人吵闹并损坏物品',
  intent: '求助-纠纷',
  entities: [
    { type: 'location', value: '报警人家门口', start: 2, end: 8 },
    { type: 'behavior', value: '吵闹', start: 8, end: 10 },
    { type: 'behavior', value: '砸东西', start: 12, end: 15 },
  ],
  riskAssessment: {
    level: 'medium',
    score: 65,
    factors: ['情绪激动', '财产损坏', '可能升级为肢体冲突'],
    suggestion: '建议派遣2名以上警力，注意现场控制，防止事态升级',
  },
};

export const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'alert',
    title: '新的高风险预警',
    message: '系统检测到新的高风险预警，请及时处理',
    timestamp: '2024-01-15 14:32:00',
    read: false,
  },
  {
    id: '2',
    type: 'case',
    title: '案件已分配',
    message: '案件BJ2024011503已分配给您处理',
    timestamp: '2024-01-15 14:05:00',
    read: false,
  },
  {
    id: '3',
    type: 'target',
    title: '布控目标出现',
    message: '布控目标李某在北京西站被识别',
    timestamp: '2024-01-15 13:45:00',
    read: true,
  },
];

export const riskLevelMap = {
  high: { label: '高风险', class: 'status-critical' },
  medium: { label: '中风险', class: 'status-warning' },
  low: { label: '低风险', class: 'status-normal' },
};

export const statusMap = {
  new: { label: '新建', class: 'status-info' },
  assigned: { label: '已分配', class: 'status-warning' },
  processing: { label: '处理中', class: 'status-info' },
  closed: { label: '已结案', class: 'status-normal' },
  pending: { label: '待处理', class: 'status-warning' },
  resolved: { label: '已解决', class: 'status-normal' },
  active: { label: '布控中', class: 'status-critical' },
  inactive: { label: '已撤销', class: 'status-normal' },
  captured: { label: '已抓获', class: 'status-normal' },
};

export const caseTypeMap = {
  '纠纷': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '盗窃': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  '滋事': 'bg-red-500/20 text-red-400 border-red-500/30',
  '走失': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  '交通事故': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};
