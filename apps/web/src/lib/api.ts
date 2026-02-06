/**
 * API Client for ASC Inventory System
 *
 * ⚠️  RE-EXPORT SHIM — DO NOT ADD NEW ENDPOINTS HERE  ⚠️
 *
 * This file exists solely for backward compatibility. All API functions and
 * types have been moved to domain-specific modules under ./api/.
 *
 * New code should import directly from the domain module:
 *   import { getCases } from '$lib/api/cases';
 *
 * This shim will be removed once all call sites are migrated.
 * See: docs/PROCEDURES/api-conventions.md (Wave 4)
 */

// Core client utilities
export { ApiError, resolveAssetUrl } from './api/client';

// Auth
export { login, getMe } from './api/auth';
export type { LoginResponse } from './api/auth';

// Cases
export { getCases, getCase, createCase, activateCase, deactivateCase, cancelCase, checkInPreop, approveCase, rejectCase, updateCase, deleteCase, assignCaseRoom } from './api/cases';
export type { Case, ActivateCaseRequest } from './api/cases';

// Readiness
export { getDayBeforeReadiness, getCalendarSummary, createAttestation, voidAttestation, refreshReadiness, getCaseVerification } from './api/readiness';
export type { MissingItem, CaseReadiness, DayBeforeResponse, CalendarDaySummary, CalendarCaseSummary, CalendarSummaryResponse, CreateAttestationRequest, AttestationResponse, VoidAttestationResponse, VerificationItem, VerificationRequirement, CaseVerificationResponse } from './api/readiness';

// Inventory
export { sendDeviceEvent, createDeviceEvent, getDevices, getInventoryItems, getInventoryItem, createInventoryItem, updateInventoryItem, getInventoryItemHistory, createInventoryEvent, getInventoryRiskQueue } from './api/inventory';
export type { DeviceEventRequest, GS1Data, CatalogMatch, DeviceEventResponse, Device, InventoryItem, InventoryItemDetail, CreateInventoryItemRequest, UpdateInventoryItemRequest, InventoryItemEvent, CreateInventoryEventRequest, RiskQueueItem } from './api/inventory';

// Catalog
export { getCatalogItems, getCatalogItem, createCatalogItem, updateCatalogItem, deactivateCatalogItem, activateCatalogItem, getCatalogGroups, createCatalogGroup, updateCatalogGroup, getCatalogGroupItems, addCatalogGroupItems, removeCatalogGroupItem, getCatalogSets, getSetComponents, addSetComponent, updateSetComponent, removeSetComponent, getCatalogImages, addCatalogImageByUrl, uploadCatalogImage, updateCatalogImage, deleteCatalogImage, getCatalogIdentifiers, addCatalogIdentifier, deleteCatalogIdentifier } from './api/catalog';
export type { ItemCategory, Criticality, CatalogItem, CreateCatalogItemRequest, UpdateCatalogItemRequest, CatalogGroup, CatalogGroupItem, CreateCatalogGroupRequest, UpdateCatalogGroupRequest, CatalogSet, SetComponent, CreateSetComponentRequest, UpdateSetComponentRequest, CatalogImage, CatalogIdentifier } from './api/catalog';

// Users
export { getUsers, getUser, createUser, updateUser, deactivateUser, activateUser, getSurgeons } from './api/users';
export type { User, CreateUserRequest, UpdateUserRequest } from './api/users';

// Checklists
export { getCaseChecklists, startChecklist, respondToChecklist, signChecklist, completeChecklist, recordAsyncReview, getPendingReviews, getMyPendingReviews, getFlaggedReviews, resolveFlaggedReview, resolveSurgeonFlag, getSurgeonChecklists, updateSurgeonFeedback, getChecklistTemplates, getChecklistTemplate, updateChecklistTemplate } from './api/checklists';
export type { ChecklistItem, RequiredSignature, ChecklistResponse, ChecklistSignature, ChecklistInstance, CaseChecklistsResponse, PendingReview, PendingReviewsResponse, FlaggedReview, DebriefItemForReview, FlaggedReviewsResponse, SurgeonChecklist, SurgeonChecklistsResponse, ChecklistTemplateItem, ChecklistTemplateSignature, ChecklistTemplateData } from './api/checklists';

// Settings (facility, rooms, surgeons, config items, locations)
export { getFacilitySettings, updateFacilitySettings, getRooms, getSettingsRooms, createRoom, updateRoom, deactivateRoom, activateRoom, reorderRooms, getSettingsSurgeons, updateSurgeonSettings, getConfigItems, createConfigItem, updateConfigItem, deactivateConfigItem, activateConfigItem, reorderConfigItems, getLocations, getLocation, createLocation, updateLocation, deleteLocation } from './api/settings';
export type { FacilitySettings, Room, RoomDetail, CreateRoomRequest, UpdateRoomRequest, SurgeonSettings, ConfigItemType, ConfigItem, CreateConfigItemRequest, UpdateConfigItemRequest, Location, CreateLocationRequest, UpdateLocationRequest } from './api/settings';

// Case Cards
export { getCaseCards, getCaseCard, getCaseCardEditLog, getCaseCardVersions, createCaseCard, updateCaseCard, activateCaseCard, deprecateCaseCard, getCaseCardSurgeons, submitCaseCardFeedback, getCaseCardFeedback, reviewCaseCardFeedback } from './api/case-cards';
export type { CaseCardStatus, CaseType, CaseCardSummary, CaseCardVersionData, CaseCardDetail, CaseCardEditLogEntry, CaseCardCreateRequest, CaseCardUpdateRequest, CaseCardFeedbackSubmitRequest, CaseCardFeedback, CaseCardFeedbackResponse } from './api/case-cards';

// Case Dashboard
export { getCaseDashboard, attestCaseReadiness, voidCaseAttestation, updateAnesthesiaPlan, linkCaseCard, addCaseOverride, updateCaseOverride, removeCaseOverride, getCaseEventLog, updateCaseSummary, updateCaseScheduling } from './api/case-dashboard';
export type { AnesthesiaModality, AttestationState, CaseEventType, CaseDashboardCaseCard, CaseDashboardAnesthesiaPlan, CaseDashboardOverride, CaseDashboardData, CaseDashboardEventLogEntry } from './api/case-dashboard';

// Reports
export { getAvailableReports, getInventoryReadinessReport, getVerificationActivityReport, getChecklistComplianceReport, getCaseSummaryReport, getVendorConcessionsReport, getInventoryValuationReport, getLoanerExposureReport, getReportExportUrl } from './api/reports';
export type { ReportDefinition, ReportFilters, FinancialReportFilters, InventoryReadinessRow, InventoryReadinessSummary, VerificationActivityRow, VerificationActivitySummary, ChecklistComplianceRow, ChecklistComplianceSummary, CaseSummaryRow, CaseSummarySummary, VendorConcessionRow, VendorConcessionSummary, InventoryValuationRow, InventoryValuationSummary, LoanerExposureRow, LoanerExposureSummary } from './api/reports';

// Preference Cards
export { getPreferenceCards, getPreferenceCard, getPreferenceCardVersions, createPreferenceCard, updatePreferenceCard, createPreferenceCardVersion, deactivatePreferenceCard, activatePreferenceCard } from './api/preference-cards';
export type { PreferenceCardItem, PreferenceCardVersion, PreferenceCard, CreatePreferenceCardRequest, UpdatePreferenceCardRequest, CreatePreferenceCardVersionRequest } from './api/preference-cards';

// Schedule
export { getDaySchedule, getUnassignedCases, createBlockTime, updateBlockTime, deleteBlockTime, setRoomDayConfig, reorderScheduleItems } from './api/schedule';
export type { ScheduleItem, RoomSchedule, DayScheduleResponse, BlockTime, RoomDayConfig, UnassignedCase, UnassignedCasesResponse } from './api/schedule';
