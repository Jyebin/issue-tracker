-- TestFlow Database Schema
CREATE DATABASE IF NOT EXISTS testflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE testflow;

-- 프로젝트 (파이프라인 실행 단위)
CREATE TABLE IF NOT EXISTS projects (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  status      ENUM('analyzing','needs_input','generating','done','error') DEFAULT 'analyzing',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 기획서 원문
CREATE TABLE IF NOT EXISTS specs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  project_id      INT NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  file_type       VARCHAR(20),
  original_text   LONGTEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- AI가 감지한 누락 항목
CREATE TABLE IF NOT EXISTS missing_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_id   INT NOT NULL,
  spec_id      INT NOT NULL,
  question     TEXT NOT NULL,
  description  TEXT,
  priority     ENUM('critical','high','medium','low') DEFAULT 'medium',
  order_index  INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (spec_id)    REFERENCES specs(id)    ON DELETE CASCADE
);

-- 사용자가 보완한 답변
CREATE TABLE IF NOT EXISTS missing_item_answers (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  missing_item_id  INT NOT NULL UNIQUE,
  answer           TEXT NOT NULL,
  answered_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (missing_item_id) REFERENCES missing_items(id) ON DELETE CASCADE
);

-- 최종 기획서 (원문 + 보완 내용 합성)
CREATE TABLE IF NOT EXISTS final_specs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  content     LONGTEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 테스트 케이스
CREATE TABLE IF NOT EXISTS test_cases (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  title       VARCHAR(500) NOT NULL,
  module      VARCHAR(255),
  type        VARCHAR(100),
  priority    ENUM('critical','high','medium','low') DEFAULT 'medium',
  status      ENUM('pending','pass','fail') DEFAULT 'pending',
  steps       JSON,
  expected    TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Playwright 테스트 코드
CREATE TABLE IF NOT EXISTS test_code (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  content     LONGTEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 이슈
CREATE TABLE IF NOT EXISTS issues (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  tc_id       INT,
  title       VARCHAR(500) NOT NULL,
  priority    ENUM('critical','high','medium','low') DEFAULT 'medium',
  module      VARCHAR(255),
  description TEXT,
  status      ENUM('open','in_progress','resolved') DEFAULT 'open',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- missing_items suggestions 컬럼 (없을 경우 추가)
-- ALTER TABLE missing_items ADD COLUMN IF NOT EXISTS suggestions JSON NULL AFTER priority;

-- 테스트 플랜 (여러 사이클을 묶는 계획 단위)
CREATE TABLE IF NOT EXISTS test_plans (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 테스트 사이클 (플랜 하위 실행 단위)
CREATE TABLE IF NOT EXISTS test_cycles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  plan_id     INT NOT NULL,
  project_id  INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  status      ENUM('not_started','in_progress','done') DEFAULT 'not_started',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_plan    (plan_id),
  INDEX idx_project (project_id),
  FOREIGN KEY (plan_id)    REFERENCES test_plans(id)  ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id)    ON DELETE CASCADE
);

-- 사이클 내 TC 실행 항목
CREATE TABLE IF NOT EXISTS test_cycle_cases (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id     INT NOT NULL,
  test_case_id INT NOT NULL,
  status       ENUM('pending','pass','fail','na') DEFAULT 'pending',
  executed_at  TIMESTAMP NULL,
  UNIQUE KEY uq_cycle_case (cycle_id, test_case_id),
  INDEX idx_cycle (cycle_id),
  FOREIGN KEY (cycle_id)     REFERENCES test_cycles(id)  ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id)   ON DELETE CASCADE
);
