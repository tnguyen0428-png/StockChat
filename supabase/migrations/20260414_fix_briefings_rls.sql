DROP POLICY IF EXISTS "briefings_read" ON daily_briefings;
CREATE POLICY "briefings_read_all" ON daily_briefings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "briefings_insert_service" ON daily_briefings FOR INSERT WITH CHECK (true);
