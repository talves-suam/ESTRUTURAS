-- Schema enxuto — Estruturas Curriculares UNISUAM
-- Payload JSON sem PDFs embutidos (só links do Drive).
-- Charset utf8mb4 para acentos / emojis.

CREATE TABLE IF NOT EXISTS curriculum_structures (
  id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL DEFAULT '',
  course_id VARCHAR(64) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NULL,
  payload MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_structures_code (code),
  KEY idx_structures_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curriculum_courses (
  id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NULL,
  payload MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_courses_code (code),
  KEY idx_courses_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR(64) NOT NULL DEFAULT 'app_settings',
  updated_at DATETIME(3) NULL,
  payload MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
