import { ExceptionType, ResolutionAction, ExceptionStatus } from '../domain/exception.entity';

export interface CreateExceptionDto {
  type: ExceptionType;
  context: Record<string, any>;
  evidence: Record<string, any>;
  aiRecommendation: string;
  confidence: number;
  reason: string;
  availableActions: ResolutionAction[];
}

export interface ResolveExceptionDto {
  action: ResolutionAction;
  notes?: string;
}

export interface ExceptionResponseDto {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  context: Record<string, any>;
  evidence: Record<string, any>;
  aiRecommendation: string;
  confidence: number;
  reason: string;
  availableActions: ResolutionAction[];
  createdAt: Date;
  updatedAt: Date;
}
