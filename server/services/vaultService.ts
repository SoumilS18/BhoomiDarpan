import { VaultDocument, DocumentVaultStats, VaultDocumentCategory } from '../../shared/types';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';

let mockVaultDocuments: VaultDocument[] = [
  {
    id: 'doc-v-001',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    title: 'Gazette Preliminary Notification Section 11 (No. MAH-GAZ-2026/PUN/118)',
    category: 'gazette_notification',
    file_name: 'MH_PUN_Sec11_Gazette_Official_118.pdf',
    file_size_bytes: 4280000,
    mime_type: 'application/pdf',
    storage_url: '/storage/vault/MH_PUN_Sec11_Gazette_Official_118.pdf',
    ocr_extracted: true,
    ocr_confidence: 98.6,
    extracted_entities: {
      survey_numbers: ['142/1A', '142/1B', '143', '144/2', '145/1'],
      village: 'Manjri Khurd',
      district: 'Pune',
      statutory_sections: ['Section 11(1)', 'Section 12', 'Section 15(1)'],
      dates: ['2026-02-18'],
      financial_amounts: [395910000],
    },
    sha256_hash: 'a3f89e2c4b8109d7e5621fb042e88a31c5d9921473be9f1165bc9801824a7ef1',
    verification_status: 'verified',
    uploaded_by: 'lao.pune@bhoomidarpan.gov.in',
    uploaded_at: '2026-02-18T14:22:00Z',
  },
  {
    id: 'doc-v-002',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    title: '7/12 Land Record Extracts & Mutation Register (Village Manjri Khurd)',
    category: 'land_record_7_12',
    file_name: 'ManjriKhurd_7_12_Extracts_Survey142_145.pdf',
    file_size_bytes: 8150000,
    mime_type: 'application/pdf',
    storage_url: '/storage/vault/ManjriKhurd_7_12_Extracts_Survey142_145.pdf',
    ocr_extracted: true,
    ocr_confidence: 95.4,
    extracted_entities: {
      survey_numbers: ['142/1A', '144/2'],
      village: 'Manjri Khurd',
      district: 'Pune',
      dates: ['2026-01-12'],
    },
    sha256_hash: '8f72bb192a01ce945037d3fa789c104473e6b41295b9320e18fc09139ac84df7',
    verification_status: 'verified',
    uploaded_by: 'ri.pune@bhoomidarpan.gov.in',
    uploaded_at: '2026-01-15T11:05:00Z',
  },
  {
    id: 'doc-v-003',
    case_id: 'case-harden-pune-001',
    case_number: 'MH-PUN-2026-0089',
    project_id: 'proj-pune-ring-01',
    project_name: 'Pune Outer Ring Road - Western Alignment',
    title: 'Comprehensive Social Impact Assessment (SIA) Final Report & SIMP',
    category: 'sia_report',
    file_name: 'Pune_RingRoad_SIA_Final_Gokhale_Inst.pdf',
    file_size_bytes: 14200000,
    mime_type: 'application/pdf',
    storage_url: '/storage/vault/Pune_RingRoad_SIA_Final_Gokhale_Inst.pdf',
    ocr_extracted: true,
    ocr_confidence: 99.1,
    extracted_entities: {
      village: 'Manjri Khurd',
      district: 'Pune',
      statutory_sections: ['Section 4', 'Section 7'],
      financial_amounts: [85000000],
    },
    sha256_hash: '3e41b9c849102ef765ad8819c40217bca88921df04523bb8091cf76e1082ab41',
    verification_status: 'verified',
    uploaded_by: 'po.pune@bhoomidarpan.gov.in',
    uploaded_at: '2026-01-20T09:40:00Z',
  },
  {
    id: 'doc-v-004',
    case_id: 'case-aur-002',
    case_number: 'MH-AUR-2026-0042',
    project_id: 'proj-dmic-aur-02',
    project_name: 'AURIC Industrial Node 2',
    title: 'High Court Interim Order & Demarcation Stay Clarification (WP 4182/2026)',
    category: 'court_order',
    file_name: 'Bombay_HC_Order_WP_4182_Bidkin_Stay_Clarification.pdf',
    file_size_bytes: 2640000,
    mime_type: 'application/pdf',
    storage_url: '/storage/vault/Bombay_HC_Order_WP_4182_Bidkin_Stay_Clarification.pdf',
    ocr_extracted: true,
    ocr_confidence: 97.2,
    extracted_entities: {
      survey_numbers: ['89/3B', '92/1'],
      village: 'Bidkin',
      district: 'Chhatrapati Sambhajinagar',
      statutory_sections: ['Section 64 Reference'],
    },
    sha256_hash: '921ec4f8730b291d9047ca881e4b9015c7731ba8945209ea4017df8549ce2189',
    verification_status: 'verified',
    uploaded_by: 'legal.officer@bhoomidarpan.gov.in',
    uploaded_at: '2026-03-05T16:15:00Z',
  },
  {
    id: 'doc-v-005',
    case_id: 'case-aur-002',
    case_number: 'MH-AUR-2026-0042',
    project_id: 'proj-dmic-aur-02',
    project_name: 'AURIC Industrial Node 2',
    title: 'Approved R&R Scheme & Second Schedule Matrix (No. RR/MH/AUR/2026/09)',
    category: 'rr_scheme',
    file_name: 'AURIC_Node2_Approved_RR_Scheme_Bidkin.pdf',
    file_size_bytes: 9800000,
    mime_type: 'application/pdf',
    storage_url: '/storage/vault/AURIC_Node2_Approved_RR_Scheme_Bidkin.pdf',
    ocr_extracted: true,
    ocr_confidence: 96.8,
    extracted_entities: {
      survey_numbers: ['89/1', '89/3B'],
      village: 'Bidkin',
      statutory_sections: ['Section 16', 'Section 19'],
      financial_amounts: [142000000],
    },
    sha256_hash: '57a9f81b23901ce48972df54190ba3221087cf95412398ebc719823410a7bc61',
    verification_status: 'verified',
    uploaded_by: 'lao.aur@bhoomidarpan.gov.in',
    uploaded_at: '2026-02-28T12:00:00Z',
  },
];

export async function getVaultDocuments(params?: {
  category?: string;
  case_id?: string;
  project_id?: string;
  status?: string;
  search?: string;
}): Promise<VaultDocument[]> {
  let docs = [...mockVaultDocuments];

  if (params?.category && params.category !== 'all') {
    docs = docs.filter((d) => d.category === params.category);
  }
  if (params?.case_id) {
    docs = docs.filter((d) => d.case_id === params.case_id);
  }
  if (params?.project_id) {
    docs = docs.filter((d) => d.project_id === params.project_id);
  }
  if (params?.status && params.status !== 'all') {
    docs = docs.filter((d) => d.verification_status === params.status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q) ||
        (d.case_number && d.case_number.toLowerCase().includes(q)) ||
        (d.sha256_hash && d.sha256_hash.toLowerCase().includes(q))
    );
  }

  return docs;
}

export async function getDocumentVaultStats(): Promise<DocumentVaultStats> {
  const docs = await getVaultDocuments();

  const category_breakdown = docs.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {} as Record<VaultDocumentCategory, number>);

  const totalBytes = docs.reduce((sum, d) => sum + d.file_size_bytes, 0);

  return {
    total_documents: docs.length,
    verified_documents: docs.filter((d) => d.verification_status === 'verified').length,
    pending_ocr_documents: docs.filter((d) => !d.ocr_extracted).length,
    flagged_documents: docs.filter((d) => d.verification_status === 'flagged').length,
    category_breakdown: category_breakdown as any,
    storage_total_bytes: totalBytes,
  };
}
