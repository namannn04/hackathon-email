import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { importCampaign } from '@/lib/imports/import-campaign';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(400, 'Choose a CSV or XLSX recipient file.', 'FILE_REQUIRED');
    }
    const batchSizeValue = Number(form.get('batchSize') ?? 300);
    if (!Number.isInteger(batchSizeValue) || batchSizeValue < 1 || batchSizeValue > 500) {
      throw new HttpError(400, 'Batch size must be between 1 and 500.', 'INVALID_BATCH_SIZE');
    }
    const result = await importCampaign(
      {
        name: readString(form.get('name'), 'Campaign name', 120),
        subject: readString(form.get('subject'), 'Subject', 180),
        bodyText: readString(form.get('bodyText'), 'Email content', 50_000),
        batchSize: batchSizeValue,
        file,
      },
      actor,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
