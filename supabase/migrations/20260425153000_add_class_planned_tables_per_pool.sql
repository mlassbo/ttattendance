ALTER TABLE classes
ADD COLUMN planned_tables_per_pool INT NOT NULL DEFAULT 1;

ALTER TABLE classes
ADD CONSTRAINT classes_planned_tables_per_pool_positive
CHECK (planned_tables_per_pool >= 1);