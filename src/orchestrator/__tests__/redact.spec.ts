import { redact } from '../redact';

describe('redact', () => {
  it('replaces by sub_category placeholder', () => {
    const text = '제 주민등록번호는 900101-1234567 입니다.';
    const out = redact(text, [
      {
        detector_id: 'pii.id.rrn.kr',
        category: 'pii',
        sub_category: 'national_id_kr',
        locale: 'ko-KR',
        start: 11,
        end: 25,
        matched_text: '900101-1234567',
        confidence: 0.98,
      },
    ]);
    expect(out).toContain('******-*******');
    expect(out).not.toContain('900101-1234567');
  });

  it('preserves non-match prefix/suffix', () => {
    const out = redact('Email: user@example.com please', [
      {
        detector_id: 'pii.contact.email',
        category: 'pii',
        sub_category: 'email',
        locale: 'en',
        start: 7,
        end: 23,
        matched_text: 'user@example.com',
        confidence: 0.95,
      },
    ]);
    expect(out).toBe('Email: [EMAIL] please');
  });

  it('handles overlapping-free right-to-left order', () => {
    const out = redact('a 010-1234-5678 and 010-2222-3333 done', [
      {
        detector_id: 'pii.contact.phone.kr',
        category: 'pii',
        sub_category: 'phone_kr',
        locale: 'ko-KR',
        start: 2,
        end: 15,
        matched_text: '010-1234-5678',
        confidence: 0.95,
      },
      {
        detector_id: 'pii.contact.phone.kr',
        category: 'pii',
        sub_category: 'phone_kr',
        locale: 'ko-KR',
        start: 20,
        end: 33,
        matched_text: '010-2222-3333',
        confidence: 0.95,
      },
    ]);
    expect(out).toBe('a [PHONE] and [PHONE] done');
  });
});
