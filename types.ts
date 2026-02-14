
export enum ProjectTab {
  LIBRARY = 'Library',
  ANALYSIS = 'Analysis',
  READER = 'Reader',
  WEB_RESEARCH = 'Web Research',
  CASE_LOGIC = 'Case Logic',
  WIKIS = 'Intelligence Wiki',
  PUBLIC_MARKET = 'Marketplace',
  ANALYTICS = 'Analytics',
  LOCATIONS = 'Locations',
  TIMELINE = 'Timeline',
  CANVAS = 'Canvas',
  SETTINGS = 'Settings'
}

export type InfoBitType = 'Insight' | 'Development' | 'Crucial' | 'Correction' | 'Quote';
export type StanceType = 'Opposition' | 'Friend' | 'Pro' | 'Neutral';

export interface ResearchSignal {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  timestamp: string;
  source: string;
}

export interface ForensicRelationship {
  id: string;
  targetId: string; // ID of another ManualSignal
  targetName: string;
  type: StanceType;
  notes?: string;
}

export interface InformationBit {
  id: string;
  text: string;
  type: InfoBitType;
  timestamp: string;
  linkedEntityId?: string; // Link to a ManualSignal
}

export interface BountyAnswer {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  isVerified: boolean;
  comments: { author: string, text: string, timestamp: string }[];
}

export interface BountyQuestion {
  id: string;
  title: string;
  description: string;
  rewardValue: number;
  importance: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Resolved' | 'Disputed';
  answers: BountyAnswer[];
  createdAt: string;
}

export interface ForensicWiki {
  id: string;
  name: string;
  category: string;
  bio: string;
  imageUrl?: string;
  keySignals: string[];
  relationships: ForensicRelationship[];
  supportingDocIds: string[];
  lastUpdated: string;
  valuation: number;
}

export interface Entity {
  name: string;
  type: 'Person' | 'Org' | 'Gov' | 'Object' | 'Other';
}

export interface Location {
  name: string;
  lat: number;
  lng: number;
}

export interface TimelineEvent {
  id: string;
  date: string;
  event: string;
  location?: string;
  userNotes?: string;
  linkedDocIds?: string[];
  isAiGenerated?: boolean;
}

export interface HotWord {
  word: string;
  count: number;
}

export type InvestigationPriority = 'Critical' | 'High' | 'Medium' | 'Low' | 'Routine';
export type VerdictSlant = 'Innocent' | 'Guilty' | 'Neutral';
export type PoliticalLean = 'Left' | 'Right' | 'Center' | 'None';

export interface ManualSignal {
  id: string;
  category: 'Person' | 'Entity' | 'Location' | 'Publisher' | 'Author' | 'Event';
  value: string;
  bias: string;
  politicalBias?: PoliticalLean;
  trustScore?: number; // 0-100
  forensicRole?: string; // Label for the person/entity
  connections?: ForensicRelationship[];
  linkedBitIds?: string[]; // IDs of linked InformationBits
}

export interface DocumentData {
  id: string;
  title: string;
  date: string;
  size: string;
  type: string;
  docCategory?: string;
  status: 'complete' | 'error' | 'processing' | 'local-only' | 'pending';
  ocrProgress?: number;
  hasAiAnalysis: boolean;
  aiContext: string;
  manualContext: string;
  textContent: string;
  manualSummary: string;
  pagePreviews: string[]; 
  entities: Entity[];
  locations: Location[];
  timeline: TimelineEvent[];
  hotWords: HotWord[];
  manualSignals: ManualSignal[];
  infoFound: InformationBit[];
  manualFacts: string[];
  publisher?: string;
  author?: string;
  importanceScore?: number;
  investigationPriority?: InvestigationPriority;
  verdictSlant?: VerdictSlant;
  docBias?: PoliticalLean;
  significanceRationale?: string;
  isApproved?: boolean;
  approvedAt?: string;
  isConflict?: boolean;
  isDuplicate?: boolean;
}

export interface CaseLogic {
  hypothesis: string;
  aiHypothesis: string;
  facts: string[];
  actors: string[];
}

export interface CanvasNode {
  id: string;
  type: 'doc' | 'actor' | 'node' | 'entity-bubble' | 'note' | 'info-bit';
  x: number;
  y: number;
  label: string;
  refId?: string;
  size?: number;
}

export interface CanvasLink {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export type CanvasViewMode = 'Network' | 'Pyramid';
