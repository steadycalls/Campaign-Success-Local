-- Churn risk scoring
ALTER TABLE companies ADD COLUMN churn_risk_score INTEGER;
ALTER TABLE companies ADD COLUMN churn_risk_grade TEXT;
ALTER TABLE companies ADD COLUMN churn_risk_reason TEXT;
ALTER TABLE companies ADD COLUMN churn_risk_computed_at TEXT;

-- Revenue & contract tracking
ALTER TABLE companies ADD COLUMN monthly_revenue REAL;
ALTER TABLE companies ADD COLUMN contract_value REAL;
ALTER TABLE companies ADD COLUMN contract_start TEXT;
ALTER TABLE companies ADD COLUMN contract_end TEXT;
ALTER TABLE companies ADD COLUMN service_type TEXT;
