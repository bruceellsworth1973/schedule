DROP TABLE IF EXISTS `activity_history`;
CREATE TABLE `activity_history` (
  `event_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint DEFAULT NULL,
  `event_type` varchar(240) NOT NULL,
  `table_name` varchar(20) NOT NULL,
  `event_timestamp` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `fk_user_id2` (`user_id`),
  CONSTRAINT `fk_user_id2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=854 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `activity_history` WRITE;
UNLOCK TABLES;

DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments` (
  `file_id` bigint NOT NULL AUTO_INCREMENT,
  `filename` varchar(120) NOT NULL,
  `filesize` int unsigned DEFAULT NULL,
  PRIMARY KEY (`file_id`),
  UNIQUE KEY `filename` (`filename`),
  UNIQUE KEY `filename_2` (`filename`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `committees`;
CREATE TABLE `committees` (
  `committee_id` bigint NOT NULL AUTO_INCREMENT,
  `committee_name` varchar(80) DEFAULT NULL,
  `committee_chamber` char(1) DEFAULT NULL,
  PRIMARY KEY (`committee_id`),
  UNIQUE KEY `uc_committee_name` (`committee_name`,`committee_chamber`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `committees` WRITE;
INSERT INTO `committees` VALUES (1,'Agriculture and Natural Resources','S'),(19,'Agriculture, Natural Resources, and Environmental Affairs','H'),(2,'Banking and Insurance','S'),(3,'Corrections and Penology','S'),(4,'Education','S'),(20,'Education and Public Works','H'),(22,'Ethics','H'),(5,'Ethics','S'),(6,'Family and Veterans\' Services','S'),(7,'Finance','S'),(8,'Fish, Game and Forestry','S'),(9,'General','S'),(23,'Interstate Cooperation','H'),(10,'Interstate Cooperation','S'),(11,'Invitations','S'),(24,'Invitations and Memorial Resolutions','H'),(25,'Judiciary','H'),(12,'Judiciary','S'),(26,'Labor, Commerce and Industry','H'),(13,'Labor, Commerce and Industry','S'),(27,'Legislative Oversight','H'),(14,'Legislative Oversight','S'),(15,'Medical Affairs','S'),(28,'Medical, Military, Public, and Municipal Affairs','H'),(29,'Operations and Management','H'),(16,'Operations and Management','S'),(30,'Regulations and Administrative Procedures','H'),(31,'Rules','H'),(17,'Rules','S'),(18,'Transportation','S'),(32,'Ways and Means','H');
UNLOCK TABLES;

DROP TABLE IF EXISTS `group_access`;
CREATE TABLE `group_access` (
  `group_id` bigint NOT NULL,
  `permission_id` char(20) NOT NULL,
  PRIMARY KEY (`group_id`,`permission_id`),
  CONSTRAINT `group_access_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`group_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `group_access` WRITE;
INSERT INTO `group_access` VALUES (1,'addAnyMeeting'),(1,'addCommittee'),(1,'addGroup'),(1,'addSetting'),(1,'addUser'),(1,'browseAllMeetings'),(1,'cancelAnyMeeting'),(1,'deleteCommittee'),(1,'deleteGroup'),(1,'deleteSetting'),(1,'deleteUser'),(1,'generateReports'),(1,'modifyAnyMeeting'),(1,'modifyCommittee'),(1,'modifyGroup'),(1,'modifySetting'),(1,'modifyUser'),(1,'removeAnyMeeting'),(2,'addMeeting'),(2,'browseMeetings'),(2,'cancelMeeting'),(2,'modifyMeeting'),(3,'addAnyMeeting'),(3,'browseAllMeetings'),(3,'cancelAnyMeeting'),(3,'modifyAnyMeeting'),(3,'removeAnyMeeting');
UNLOCK TABLES;

DROP TABLE IF EXISTS `group_membership`;
CREATE TABLE `group_membership` (
  `member_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `group_id` bigint NOT NULL,
  `committee_id` bigint DEFAULT NULL,
  PRIMARY KEY (`member_id`),
  UNIQUE KEY `user_id` (`user_id`,`group_id`,`committee_id`),
  KEY `fk_group_id` (`group_id`),
  KEY `fk_committee_id` (`committee_id`),
  CONSTRAINT `fk_committee_id` FOREIGN KEY (`committee_id`) REFERENCES `committees` (`committee_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_id` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `group_membership` WRITE;
INSERT INTO `group_membership` VALUES (1,1,1,NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS `meetings`;
CREATE TABLE `meetings` (
  `meeting_id` bigint NOT NULL AUTO_INCREMENT,
  `sess_number` int NOT NULL,
  `chamber` char(1) NOT NULL,
  `publishtime` datetime NOT NULL,
  `meetingtime` datetime NOT NULL,
  `displaytime` varchar(80) DEFAULT NULL,
  `committeename` varchar(80) DEFAULT NULL,
  `bill_list` varchar(80) DEFAULT NULL,
  `special_requests` varchar(500) DEFAULT NULL,
  `notation` varchar(144) DEFAULT NULL,
  `phone` varchar(14) DEFAULT NULL,
  `location` varchar(40) NOT NULL,
  `agendalink` bigint DEFAULT NULL,
  `canceled` tinyint(1) NOT NULL DEFAULT '0',
  `internal` tinyint(1) NOT NULL DEFAULT '0',
  `video_type` char(1) NOT NULL DEFAULT 'N',
  `video_title` varchar(80) DEFAULT NULL,
  `video_filename` varchar(120) DEFAULT NULL,
  `video_duration` varchar(20) DEFAULT NULL,
  `youtube_video_id` varchar(20) DEFAULT NULL,
  `feed_name` varchar(20) DEFAULT NULL,
  `house_committee` bigint DEFAULT NULL,
  `senate_committee` bigint DEFAULT NULL,
  PRIMARY KEY (`meeting_id`),
  KEY `senate_committee` (`senate_committee`),
  KEY `house_committee` (`house_committee`),
  KEY `agendalink` (`agendalink`),
  CONSTRAINT `meetings_ibfk_1` FOREIGN KEY (`senate_committee`) REFERENCES `committees` (`committee_id`),
  CONSTRAINT `meetings_ibfk_2` FOREIGN KEY (`house_committee`) REFERENCES `committees` (`committee_id`),
  CONSTRAINT `meetings_ibfk_3` FOREIGN KEY (`agendalink`) REFERENCES `attachments` (`file_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `operators`;
CREATE TABLE `operators` (
  `operator_id` bigint NOT NULL AUTO_INCREMENT,
  `operator_name` varchar(30) DEFAULT NULL,
  `operator_phone` varchar(20) DEFAULT NULL,
  `operator_email` varchar(30) DEFAULT NULL,
  `operator_send_email` tinyint(1) DEFAULT NULL,
  `operator_send_sms` tinyint(1) DEFAULT NULL,
  `operator_active` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `permission_id` char(20) NOT NULL,
  PRIMARY KEY (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `permissions` WRITE;
INSERT INTO `permissions` VALUES ('addAnyMeeting'),('addCommittee'),('addGroup'),('addMeeting'),('addSetting'),('addUser'),('browseAllMeetings'),('browseMeetings'),('cancelAnyMeeting'),('cancelMeeting'),('deleteCommittee'),('deleteGroup'),('deleteSetting'),('deleteUser'),('generateReports'),('modifyAnyMeeting'),('modifyCommittee'),('modifyGroup'),('modifyMeeting'),('modifySetting'),('modifyUser'),('removeAnyMeeting'),('removeMeeting');
UNLOCK TABLES;

DROP TABLE IF EXISTS `record_locks`;
CREATE TABLE `record_locks` (
  `lock_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` char(24) NOT NULL,
  `table_name` varchar(40) NOT NULL,
  `primary_key` varchar(40) NOT NULL,
  `key_value` bigint NOT NULL,
  `lock_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lock_id`),
  UNIQUE KEY `table_name` (`table_name`,`primary_key`,`key_value`),
  KEY `session_id` (`session_id`),
  CONSTRAINT `record_locks_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=438 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `report_columns`;
CREATE TABLE `report_columns` (
  `column_id` bigint NOT NULL AUTO_INCREMENT,
  `report_id` bigint NOT NULL,
  `criterion` enum('event_id','event_type','table_name','event_timestamp','login_name','meeting_id','sess_number','chamber','publishtime','meetingtime','displaytime','committeename','bill_list','special_requests','notation','phone','location','agendalink','canceled','internal','video_type','video_title','video_filename','video_duration','youtube_video_id','feed_name','house_committee','senate_committee') NOT NULL,
  `priority` int unsigned NOT NULL,
  PRIMARY KEY (`column_id`),
  UNIQUE KEY `report_id` (`report_id`,`priority`),
  CONSTRAINT `report_columns_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `report_filters`;
CREATE TABLE `report_filters` (
  `filter_id` bigint NOT NULL AUTO_INCREMENT,
  `report_id` bigint NOT NULL,
  `conjunction` enum('AND','OR') NOT NULL DEFAULT 'AND',
  `criterion` enum('absolutetime','timeofday','dayofweek','event','table','location','title','session','chamber','senatecommittee','housecomittee','bill','audience','canceled','videotype') NOT NULL,
  `column_name` varchar(20) NOT NULL,
  `operator` enum('<','>','<=','>=','=','!=','STARTSWITH','ENDSWITH','CONTAINS','BEFORE','AFTER') NOT NULL,
  `value` varchar(20) NOT NULL,
  `priority` int unsigned NOT NULL,
  PRIMARY KEY (`filter_id`),
  UNIQUE KEY `report_id` (`report_id`,`priority`),
  CONSTRAINT `report_filters_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=157 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `report_limits`;
CREATE TABLE `report_limits` (
  `limit_id` bigint NOT NULL AUTO_INCREMENT,
  `report_id` bigint NOT NULL,
  `criterion` enum('rows','timerange','futuremeetings','relativedates') NOT NULL,
  `span` varchar(20) NOT NULL,
  `comparison` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`limit_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `report_limits_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `report_sorts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_sorts` (
  `sort_id` bigint NOT NULL AUTO_INCREMENT,
  `report_id` bigint NOT NULL,
  `criterion` enum('time','user','event','committee') NOT NULL,
  `column_name` varchar(20) NOT NULL,
  `value` varchar(20) NOT NULL,
  `priority` int unsigned NOT NULL,
  PRIMARY KEY (`sort_id`),
  UNIQUE KEY `report_id` (`report_id`,`priority`),
  CONSTRAINT `report_sorts_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=83 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `reports`;
CREATE TABLE `reports` (
  `report_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `report_name` varchar(40) NOT NULL,
  `datasource` enum('meetings','activities') NOT NULL,
  `private_report` tinyint(1) NOT NULL,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `report_name` (`report_name`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `reports_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `session_id` char(24) NOT NULL,
  `user_id` bigint NOT NULL,
  `last_access` datetime NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `setting_id` bigint NOT NULL AUTO_INCREMENT,
  `setting_name` varchar(20) NOT NULL,
  `setting_value` varchar(80) NOT NULL,
  PRIMARY KEY (`setting_id`),
  UNIQUE KEY `setting_name` (`setting_name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `settings` WRITE;
INSERT INTO `settings` VALUES (1,'sess_number','124');
UNLOCK TABLES;

DROP TABLE IF EXISTS `status`;
CREATE TABLE `status` (
  `table_id` bigint NOT NULL AUTO_INCREMENT,
  `table_name` varchar(20) NOT NULL,
  `last_updated` datetime NOT NULL,
  PRIMARY KEY (`table_id`),
  UNIQUE KEY `table_name` (`table_name`)
) ENGINE=InnoDB AUTO_INCREMENT=2224 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `user_groups`;
CREATE TABLE `user_groups` (
  `group_id` bigint NOT NULL AUTO_INCREMENT,
  `group_name` varchar(40) DEFAULT NULL,
  `enabled` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_name_UNIQUE` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `user_groups` WRITE;
INSERT INTO `user_groups` VALUES (1,'Admin',1),(2,'User',1);
UNLOCK TABLES;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` bigint NOT NULL AUTO_INCREMENT,
  `login_name` varchar(40) DEFAULT NULL,
  `password_hash` varchar(40) DEFAULT NULL,
  `first_name` varchar(40) DEFAULT NULL,
  `last_name` varchar(40) DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `enabled` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `users` WRITE;
INSERT INTO `users` VALUES (1,'admin','X03MO1qnZdYdgyfeuILPmQ','System','Admin','2021-05-20 01:07:26',1);
UNLOCK TABLES;

CREATE OR REPLACE VIEW `display_activity` AS select `activity_history`.`event_id` AS `event_id`,`activity_history`.`event_type` AS `event_type`,`activity_history`.`table_name` AS `table_name`,`activity_history`.`event_timestamp` AS `event_timestamp`,`users`.`login_name` AS `login_name` from (`users` join `activity_history` on((`users`.`user_id` = `activity_history`.`user_id`)));

CREATE OR REPLACE VIEW `display_meetings` AS select `m`.`meeting_id` AS `meeting_id`,`m`.`sess_number` AS `sess_number`,`m`.`chamber` AS `chamber`,`m`.`publishtime` AS `publishtime`,`m`.`meetingtime` AS `meetingtime`,`m`.`displaytime` AS `displaytime`,`m`.`committeename` AS `committeename`,`m`.`bill_list` AS `bill_list`,`m`.`special_requests` AS `special_requests`,`m`.`notation` AS `notation`,`m`.`phone` AS `phone`,`m`.`location` AS `location`,`m`.`agendalink` AS `agendalink`,`m`.`canceled` AS `canceled`,`m`.`internal` AS `internal`,`m`.`video_type` AS `video_type`,`m`.`video_title` AS `video_title`,`m`.`video_filename` AS `video_filename`,`m`.`video_duration` AS `video_duration`,`m`.`youtube_video_id` AS `youtube_video_id`,`m`.`feed_name` AS `feed_name`,`s`.`committee_name` AS `senate_committee`,`h`.`committee_name` AS `house_committee` from ((`meetings` `m` left join `committees` `s` on((`s`.`committee_id` = `m`.`senate_committee`))) left join `committees` `h` on((`h`.`committee_id` = `m`.`house_committee`)));
