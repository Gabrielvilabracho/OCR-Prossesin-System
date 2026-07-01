-- Migration: 039_create_upload_drafts
-- Motivo: Autosave del wizard de upload — permite recuperar borradores si el usuario
--         navega fuera o recarga antes de completar la subida.
-- Tablas: facturas.upload_drafts + facturas.upload_draft_files
-- RLS: el usuario solo accede a sus propios drafts (uploaded_by = auth.uid())

-- Enum para estado de archivo en draft
CREATE TYPE facturas.upload_draft_file_status AS ENUM ('pending', 'uploaded', 'failed');

-- Tabla principal de borradores
CREATE TABLE facturas.upload_drafts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES facturas.noxx_clients(id) ON DELETE CASCADE,
  uploaded_by uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

-- Tabla de archivos por borrador
CREATE TABLE facturas.upload_draft_files (
  id           uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id     uuid                              NOT NULL REFERENCES facturas.upload_drafts(id) ON DELETE CASCADE,
  file_name    text                              NOT NULL,
  file_size    bigint                            NOT NULL,
  storage_path text                              NOT NULL,
  status       facturas.upload_draft_file_status NOT NULL DEFAULT 'pending',
  created_at   timestamptz                       NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX ON facturas.upload_drafts (uploaded_by);
CREATE INDEX ON facturas.upload_drafts (expires_at);
CREATE INDEX ON facturas.upload_draft_files (draft_id);

-- RLS
ALTER TABLE facturas.upload_drafts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas.upload_draft_files ENABLE ROW LEVEL SECURITY;

-- upload_drafts: el usuario solo ve y modifica los suyos
CREATE POLICY upload_drafts_select ON facturas.upload_drafts
  FOR SELECT USING (uploaded_by = auth.uid());

CREATE POLICY upload_drafts_insert ON facturas.upload_drafts
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY upload_drafts_update ON facturas.upload_drafts
  FOR UPDATE USING (uploaded_by = auth.uid());

CREATE POLICY upload_drafts_delete ON facturas.upload_drafts
  FOR DELETE USING (uploaded_by = auth.uid());

-- upload_draft_files: acceso vía draft padre (que ya filtra por uploaded_by)
CREATE POLICY upload_draft_files_select ON facturas.upload_draft_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM facturas.upload_drafts
      WHERE upload_drafts.id = draft_id
        AND upload_drafts.uploaded_by = auth.uid()
    )
  );

CREATE POLICY upload_draft_files_insert ON facturas.upload_draft_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM facturas.upload_drafts
      WHERE upload_drafts.id = draft_id
        AND upload_drafts.uploaded_by = auth.uid()
    )
  );

CREATE POLICY upload_draft_files_update ON facturas.upload_draft_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM facturas.upload_drafts
      WHERE upload_drafts.id = draft_id
        AND upload_drafts.uploaded_by = auth.uid()
    )
  );

CREATE POLICY upload_draft_files_delete ON facturas.upload_draft_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM facturas.upload_drafts
      WHERE upload_drafts.id = draft_id
        AND upload_drafts.uploaded_by = auth.uid()
    )
  );
