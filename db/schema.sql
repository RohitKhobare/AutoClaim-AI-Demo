-- ═══════════════════════════════════════════════════════════════════
--  AutoClaim AI — Smart Insurance Claim Automation System
--  MySQL schema (works on MySQL 8.x and MariaDB 10.4+)
-- ═══════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  city          VARCHAR(80)  DEFAULT NULL,
  state         VARCHAR(80)  DEFAULT NULL,
  language      ENUM('en','hi','mr') NOT NULL DEFAULT 'en',
  theme         ENUM('light','dark') NOT NULL DEFAULT 'light',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vehicles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  registration_no VARCHAR(20) NOT NULL,
  make            VARCHAR(60) NOT NULL,
  model           VARCHAR(80) NOT NULL,
  variant         VARCHAR(60) DEFAULT NULL,
  year            SMALLINT NOT NULL,
  fuel_type       ENUM('petrol','diesel','cng','electric','hybrid') NOT NULL DEFAULT 'petrol',
  colour          VARCHAR(40) DEFAULT NULL,
  chassis_no      VARCHAR(40) DEFAULT NULL,
  engine_no       VARCHAR(40) DEFAULT NULL,
  odometer_km     INT DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_reg (registration_no),
  KEY idx_vehicles_user (user_id),
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_number  VARCHAR(40) NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  vehicle_id     INT UNSIGNED NOT NULL,
  insurer        VARCHAR(120) NOT NULL,
  policy_type    ENUM('comprehensive','third_party','own_damage') NOT NULL DEFAULT 'comprehensive',
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  sum_insured    DECIMAL(12,2) NOT NULL,
  idv            DECIMAL(12,2) NOT NULL,
  premium        DECIMAL(10,2) NOT NULL,
  deductible     DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
  ncb_percent    DECIMAL(4,1) NOT NULL DEFAULT 0,
  addons         JSON DEFAULT NULL,
  status         ENUM('active','expired','lapsed','cancelled') NOT NULL DEFAULT 'active',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_policies_number (policy_number),
  KEY idx_policies_user (user_id),
  KEY idx_policies_vehicle (vehicle_id),
  CONSTRAINT fk_policies_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_policies_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Policy clause library (retrieval source for the RAG coverage agent) ──
CREATE TABLE IF NOT EXISTS policy_clauses (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_id  INT UNSIGNED NOT NULL,
  clause_no  VARCHAR(20) NOT NULL,
  title      VARCHAR(160) NOT NULL,
  body       TEXT NOT NULL,
  category   ENUM('coverage','exclusion','condition','claim_process','deductible') NOT NULL DEFAULT 'coverage',
  PRIMARY KEY (id),
  KEY idx_clauses_policy (policy_id),
  CONSTRAINT fk_clauses_policy FOREIGN KEY (policy_id) REFERENCES policies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Claims ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  claim_number         VARCHAR(30) NOT NULL,
  user_id              INT UNSIGNED NOT NULL,
  vehicle_id           INT UNSIGNED NOT NULL,
  policy_id            INT UNSIGNED NOT NULL,
  claim_type           ENUM('own_damage','third_party','theft','natural_calamity','property') NOT NULL DEFAULT 'own_damage',
  incident_date        DATE NOT NULL,
  incident_time        TIME DEFAULT NULL,
  location             VARCHAR(180) NOT NULL,
  description          TEXT NOT NULL,
  fir_number           VARCHAR(60) DEFAULT NULL,
  reported_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,

  status               ENUM('submitted','ai_review','manual_review','approved','rejected','paid') NOT NULL DEFAULT 'submitted',
  ai_status            ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',

  -- Vision Transformer (AI-generated image detector)
  ai_image_probability DECIMAL(5,2) DEFAULT NULL,
  ai_image_verdict     ENUM('real','suspicious','ai_generated') DEFAULT NULL,

  -- CNN vehicle classification / document match
  detected_make        VARCHAR(60) DEFAULT NULL,
  detected_model       VARCHAR(80) DEFAULT NULL,
  detected_year        SMALLINT DEFAULT NULL,
  vehicle_match        DECIMAL(5,2) DEFAULT NULL,

  -- OCR (documents)
  ocr_fields           JSON DEFAULT NULL,
  ocr_verified         TINYINT(1) DEFAULT NULL,

  -- YOLOv11 damage detection + severity + repair cost
  damage_summary       JSON DEFAULT NULL,
  severity             ENUM('minor','moderate','major','total_loss') DEFAULT NULL,
  severity_score       DECIMAL(4,3) DEFAULT NULL,
  repair_cost          DECIMAL(12,2) DEFAULT NULL,
  cost_breakdown       JSON DEFAULT NULL,

  -- Fraud / risk engine
  fraud_score          DECIMAL(5,4) DEFAULT NULL,
  risk_level           ENUM('low','medium','high') DEFAULT NULL,
  fraud_signals        JSON DEFAULT NULL,

  -- RAG policy coverage agent
  coverage_covered     TINYINT(1) DEFAULT NULL,
  coverage_clause      VARCHAR(40) DEFAULT NULL,
  coverage_confidence  DECIMAL(5,2) DEFAULT NULL,

  ai_recommendation    ENUM('auto_approve','manual_review','fraud_suspected','reject') DEFAULT NULL,
  ai_confidence        DECIMAL(5,2) DEFAULT NULL,
  processing_ms        INT DEFAULT NULL,
  decision_record      JSON DEFAULT NULL,

  approved_amount      DECIMAL(12,2) DEFAULT NULL,
  decided_by           INT UNSIGNED DEFAULT NULL,
  decided_at           DATETIME DEFAULT NULL,
  decision_notes       TEXT DEFAULT NULL,
  is_manual_entry      TINYINT(1) NOT NULL DEFAULT 0,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_claims_number (claim_number),
  KEY idx_claims_user (user_id),
  KEY idx_claims_status (status),
  KEY idx_claims_policy (policy_id),
  CONSTRAINT fk_claims_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_policy FOREIGN KEY (policy_id) REFERENCES policies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Claim documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  claim_id      INT UNSIGNED NOT NULL,
  doc_type      ENUM('rc_book','driving_license','policy_copy','fir','claim_form','invoice','other') NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) DEFAULT NULL,
  size_bytes    INT UNSIGNED DEFAULT NULL,
  ocr_fields    JSON DEFAULT NULL,
  verified      TINYINT(1) DEFAULT NULL,
  checks        JSON DEFAULT NULL,
  uploaded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_docs_claim (claim_id),
  CONSTRAINT fk_docs_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Claim images ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_images (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  claim_id       INT UNSIGNED NOT NULL,
  angle          ENUM('front','rear','left','right','closeup') NOT NULL DEFAULT 'front',
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) DEFAULT NULL,
  size_bytes     INT UNSIGNED DEFAULT NULL,
  ai_probability DECIMAL(5,2) DEFAULT NULL,
  is_ai_generated TINYINT(1) DEFAULT NULL,
  damage_types   JSON DEFAULT NULL,
  uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_images_claim (claim_id),
  CONSTRAINT fk_images_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Payments (Razorpay / demo gateway) ──────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  claim_id    INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  gateway     ENUM('razorpay','demo') NOT NULL DEFAULT 'demo',
  order_id    VARCHAR(80) NOT NULL,
  payment_id  VARCHAR(80) DEFAULT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  currency    VARCHAR(8) NOT NULL DEFAULT 'INR',
  method      VARCHAR(40) DEFAULT NULL,
  status      ENUM('created','paid','failed','refunded') NOT NULL DEFAULT 'created',
  receipt     VARCHAR(80) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at     DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_payments_claim (claim_id),
  CONSTRAINT fk_payments_claim FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Support ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_no  VARCHAR(24) NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  subject    VARCHAR(160) NOT NULL,
  category   ENUM('claim','policy','payment','technical','other') NOT NULL DEFAULT 'claim',
  priority   ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status     ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_no (ticket_no),
  KEY idx_tickets_user (user_id),
  CONSTRAINT fk_tickets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id   INT UNSIGNED NOT NULL,
  sender_role ENUM('user','admin','system') NOT NULL DEFAULT 'user',
  sender_name VARCHAR(120) NOT NULL,
  message     TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ticket_msgs (ticket_id),
  CONSTRAINT fk_msgs_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Contact enquiries (public site) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(160) NOT NULL,
  phone      VARCHAR(20) DEFAULT NULL,
  subject    VARCHAR(160) NOT NULL,
  message    TEXT NOT NULL,
  status     ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Notifications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(500) NOT NULL,
  link       VARCHAR(200) DEFAULT NULL,
  icon       VARCHAR(30) DEFAULT 'bell',
  read_at    DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Audit trail ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id   INT UNSIGNED DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  action     VARCHAR(80) NOT NULL,
  entity     VARCHAR(40) DEFAULT NULL,
  entity_id  VARCHAR(40) DEFAULT NULL,
  meta       JSON DEFAULT NULL,
  ip         VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Platform settings (AI thresholds, contact details) ──────────────
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(60) NOT NULL,
  setting_value TEXT DEFAULT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
