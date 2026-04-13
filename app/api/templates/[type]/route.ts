import { buildTemplateWorkbook, templateTypeSchema } from "../../../../lib/templates/excel-templates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const parsed = templateTypeSchema.safeParse(type);

  if (!parsed.success) {
    return new Response("Nieznany typ szablonu.", { status: 404 });
  }

  const buffer = buildTemplateWorkbook(parsed.data);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"szablon-${parsed.data}.xlsx\"`,
      "Cache-Control": "no-store",
    },
  });
}
