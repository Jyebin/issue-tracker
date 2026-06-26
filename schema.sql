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
