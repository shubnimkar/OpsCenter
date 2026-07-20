import boto3
from database import get_connection
from crypto import decrypt


def get_name(tags):
    if not tags:
        return "-"
    for tag in tags:
        if tag["Key"] == "Name":
            return tag["Value"]
    return "-"


def get_profiles_from_db():
    """Fetch all profiles stored in the database."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name, access_key, secret_key, regions, color, env_tag FROM profiles ORDER BY name")
            return cur.fetchall()


def get_buckets():
    profiles = get_profiles_from_db()

    if not profiles:
        return []

    rows = []

    for profile in profiles:
        # S3 is a global service — only need one session per profile
        region = (profile["regions"] or ["us-east-1"])[0]
        try:
            session = boto3.Session(
                aws_access_key_id=decrypt(profile["access_key"]),
                aws_secret_access_key=decrypt(profile["secret_key"]),
                region_name=region,
            )
            s3 = session.client("s3")
            response = s3.list_buckets()

            for bucket in response.get("Buckets", []):
                bucket_name = bucket["Name"]
                # Determine the bucket's actual region
                try:
                    loc = s3.get_bucket_location(Bucket=bucket_name)
                    bucket_region = loc.get("LocationConstraint") or "us-east-1"
                except Exception:
                    bucket_region = "-"

                rows.append({
                    "bucket_name":   bucket_name,
                    "profile_name":  profile["name"],
                    "profile_color": profile["color"],
                    "profile_env":   profile.get("env_tag", "other"),
                    "region":        bucket_region,
                    "creation_date": bucket.get("CreationDate"),
                })
        except Exception as e:
            rows.append({
                "bucket_name":   f"Error: {str(e)}",
                "profile_name":  profile["name"],
                "profile_color": profile["color"],
                "profile_env":   profile.get("env_tag", "other"),
                "region":        "-",
                "creation_date": None,
            })

    return rows


def get_instances():
    profiles = get_profiles_from_db()

    if not profiles:
        return []

    rows = []

    for profile in profiles:
        regions = profile["regions"] or ["us-east-1"]

        for region in regions:
            try:
                session = boto3.Session(
                    aws_access_key_id=decrypt(profile["access_key"]),
                    aws_secret_access_key=decrypt(profile["secret_key"]),
                    region_name=region,
                )
                ec2 = session.client("ec2")
                paginator = ec2.get_paginator("describe_instances")

                for page in paginator.paginate():
                    for reservation in page["Reservations"]:
                        for instance in reservation["Instances"]:
                            rows.append(
                                {
                                    "Profile": profile["name"],
                                    "ProfileColor": profile["color"],
                                    "ProfileEnvTag": profile["env_tag"],
                                    "Name": get_name(instance.get("Tags")),
                                    "State": instance["State"]["Name"],
                                    "Instance ID": instance["InstanceId"],
                                    "Instance Type": instance["InstanceType"],
                                    "Public IP": instance.get("PublicIpAddress", "-"),
                                    "Private IP": instance.get("PrivateIpAddress", "-"),
                                    "Public DNS": instance.get("PublicDnsName", "-"),
                                    "AZ": instance["Placement"]["AvailabilityZone"],
                                }
                            )
            except Exception as e:
                # Don't let one bad region break the entire profile
                rows.append({
                    "Profile": profile["name"],
                    "ProfileColor": profile["color"],
                    "ProfileEnvTag": profile.get("env_tag", "other"),
                    "Name": f"Error ({region}): {str(e)}",
                    "State": "error",
                    "Instance ID": "-",
                    "Instance Type": "-",
                    "Public IP": "-",
                    "Private IP": "-",
                    "Public DNS": "-",
                    "AZ": region,
                })

    return rows


def get_iam_users(profile: dict) -> list[dict]:
    """Fetch IAM users for a single profile. IAM is global — no region loop needed."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    region = regions[0] if isinstance(regions, list) else regions

    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=region,
    )
    iam = session.client("iam")
    rows = []

    paginator = iam.get_paginator("list_users")
    for page in paginator.paginate():
        for user in page.get("Users", []):
            username = user["UserName"]

            # MFA devices
            try:
                mfa_resp = iam.list_mfa_devices(UserName=username)
                mfa_enabled = len(mfa_resp.get("MFADevices", [])) > 0
            except Exception:
                mfa_enabled = False

            # Console login profile (password-based access) + password age
            try:
                login_profile_resp = iam.get_login_profile(UserName=username)
                console_access = True
                password_created_at = login_profile_resp.get("LoginProfile", {}).get("CreateDate")
            except iam.exceptions.NoSuchEntityException:
                console_access = False
                password_created_at = None
            except Exception:
                console_access = False
                password_created_at = None

            # Access keys — full metadata including last-used info
            import json as _json
            import urllib.parse as _urllib_parse
            access_keys_detail = []
            try:
                keys_resp = iam.list_access_keys(UserName=username)
                key_list = keys_resp.get("AccessKeyMetadata", [])
                access_key_count = len(key_list)
                active_key_count = sum(1 for k in key_list if k.get("Status") == "Active")

                for key_meta in key_list:
                    key_id = key_meta["AccessKeyId"]
                    last_used_date = None
                    last_used_service = None
                    last_used_region = None
                    try:
                        lu = iam.get_access_key_last_used(AccessKeyId=key_id)
                        lu_info = lu.get("AccessKeyLastUsed", {})
                        last_used_date = lu_info.get("LastUsedDate")
                        last_used_service = lu_info.get("ServiceName")
                        last_used_region = lu_info.get("Region")
                    except Exception:
                        pass

                    access_keys_detail.append({
                        "access_key_id":     key_id,
                        "status":            key_meta.get("Status", "Unknown"),
                        "created_at":        key_meta.get("CreateDate"),
                        "last_used_date":    last_used_date,
                        "last_used_service": last_used_service,
                        "last_used_region":  last_used_region,
                    })
            except Exception:
                access_key_count = 0
                active_key_count = 0

            # Groups
            try:
                groups_resp = iam.list_groups_for_user(UserName=username)
                groups = [g["GroupName"] for g in groups_resp.get("Groups", [])]
            except Exception:
                groups = []

            # Attached managed policies
            try:
                policies_resp = iam.list_attached_user_policies(UserName=username)
                attached_policies = [p["PolicyName"] for p in policies_resp.get("AttachedPolicies", [])]
            except Exception:
                attached_policies = []

            # Inline policies (user-level policies embedded directly on the user)
            import json as _json
            import urllib.parse as _urllib_parse
            inline_policies = []
            try:
                inline_resp = iam.list_user_policies(UserName=username)
                for policy_name in inline_resp.get("PolicyNames", []):
                    try:
                        doc_resp = iam.get_user_policy(UserName=username, PolicyName=policy_name)
                        raw_doc = doc_resp.get("PolicyDocument", {})
                        # AWS returns the document URL-encoded when fetched this way
                        if isinstance(raw_doc, str):
                            raw_doc = _json.loads(_urllib_parse.unquote(raw_doc))
                        inline_policies.append({
                            "name":     policy_name,
                            "document": raw_doc,
                        })
                    except Exception:
                        inline_policies.append({"name": policy_name, "document": {}})
            except Exception:
                pass

            # Compute last_activity = most recent of password_last_used and any key's last_used_date
            from datetime import timezone as _tz
            def _to_aware(dt):
                if dt is None:
                    return None
                if hasattr(dt, 'tzinfo') and dt.tzinfo is None:
                    return dt.replace(tzinfo=_tz.utc)
                return dt

            candidates = [_to_aware(user.get("PasswordLastUsed"))]
            for k in access_keys_detail:
                candidates.append(_to_aware(k.get("last_used_date")))
            last_activity = max((c for c in candidates if c is not None), default=None)

            rows.append({
                "username":             username,
                "profile_name":         profile["name"],
                "profile_color":        profile["color"],
                "profile_env":          profile.get("env_tag", "other"),
                "user_id":              user.get("UserId", "-"),
                "arn":                  user.get("Arn", "-"),
                "path":                 user.get("Path", "/"),
                "created_at":           user.get("CreateDate"),
                "password_last_used":   user.get("PasswordLastUsed"),
                "password_created_at":  password_created_at,
                "last_activity":        last_activity,
                "mfa_enabled":          mfa_enabled,
                "console_access":       console_access,
                "access_key_count":     access_key_count,
                "active_key_count":     active_key_count,
                "access_keys_detail":   access_keys_detail,
                "groups":               groups,
                "attached_policies":    attached_policies,
                "inline_policies":      inline_policies,
            })

    return rows


def get_iam_roles(profile: dict) -> list[dict]:
    """Fetch IAM roles for a single profile."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    region = regions[0] if isinstance(regions, list) else regions

    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=region,
    )
    iam = session.client("iam")
    rows = []

    paginator = iam.get_paginator("list_roles")
    for page in paginator.paginate():
        for role in page.get("Roles", []):
            role_name = role["RoleName"]

            # Attached managed policies
            try:
                policies_resp = iam.list_attached_role_policies(RoleName=role_name)
                attached_policies = [p["PolicyName"] for p in policies_resp.get("AttachedPolicies", [])]
            except Exception:
                attached_policies = []

            # Extract trusted services from AssumeRolePolicyDocument
            trusted_services = []
            try:
                import json as _json
                trust_doc = role.get("AssumeRolePolicyDocument", {})
                if isinstance(trust_doc, str):
                    trust_doc = _json.loads(trust_doc)
                for stmt in trust_doc.get("Statement", []):
                    principal = stmt.get("Principal", {})
                    if isinstance(principal, dict):
                        svc = principal.get("Service", [])
                        if isinstance(svc, str):
                            svc = [svc]
                        trusted_services.extend(svc)
                    elif isinstance(principal, str) and principal == "*":
                        trusted_services.append("*")
            except Exception:
                pass

            rows.append({
                "role_name":            role_name,
                "profile_name":         profile["name"],
                "profile_color":        profile["color"],
                "profile_env":          profile.get("env_tag", "other"),
                "role_id":              role.get("RoleId", "-"),
                "arn":                  role.get("Arn", "-"),
                "path":                 role.get("Path", "/"),
                "created_at":           role.get("CreateDate"),
                "description":          role.get("Description") or "",
                "max_session_duration": role.get("MaxSessionDuration", 3600),
                "attached_policies":    attached_policies,
                "trusted_services":     trusted_services,
            })

    return rows


def get_iam_groups(profile: dict) -> list[dict]:
    """Fetch IAM groups for a single profile."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    region = regions[0] if isinstance(regions, list) else regions

    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=region,
    )
    iam = session.client("iam")
    rows = []

    paginator = iam.get_paginator("list_groups")
    for page in paginator.paginate():
        for group in page.get("Groups", []):
            group_name = group["GroupName"]

            # Member count
            try:
                members_resp = iam.get_group(GroupName=group_name)
                member_count = len(members_resp.get("Users", []))
            except Exception:
                member_count = 0

            # Attached managed policies
            try:
                policies_resp = iam.list_attached_group_policies(GroupName=group_name)
                attached_policies = [p["PolicyName"] for p in policies_resp.get("AttachedPolicies", [])]
            except Exception:
                attached_policies = []

            rows.append({
                "group_name":        group_name,
                "profile_name":      profile["name"],
                "profile_color":     profile["color"],
                "profile_env":       profile.get("env_tag", "other"),
                "group_id":          group.get("GroupId", "-"),
                "arn":               group.get("Arn", "-"),
                "path":              group.get("Path", "/"),
                "created_at":        group.get("CreateDate"),
                "member_count":      member_count,
                "attached_policies": attached_policies,
            })

    return rows


def get_ses_identities(profile: dict) -> list[dict]:
    """Fetch SES verified identities for a single profile across all its regions."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    rows = []

    for region in regions:
        try:
            session = boto3.Session(
                aws_access_key_id=decrypt(profile["access_key"]),
                aws_secret_access_key=decrypt(profile["secret_key"]),
                region_name=region,
            )
            ses = session.client("ses")

            # List all identities (domains + email addresses)
            paginator = ses.get_paginator("list_identities")
            identity_list = []
            for page in paginator.paginate():
                identity_list.extend(page.get("Identities", []))

            if not identity_list:
                continue

            # Batch fetch verification attributes (max 100 per call)
            BATCH = 100
            verification_attrs = {}
            for i in range(0, len(identity_list), BATCH):
                batch = identity_list[i:i + BATCH]
                resp = ses.get_identity_verification_attributes(Identities=batch)
                verification_attrs.update(resp.get("VerificationAttributes", {}))

            # Batch fetch DKIM attributes
            dkim_attrs = {}
            for i in range(0, len(identity_list), BATCH):
                batch = identity_list[i:i + BATCH]
                resp = ses.get_identity_dkim_attributes(Identities=batch)
                dkim_attrs.update(resp.get("DkimAttributes", {}))

            # Batch fetch notification attributes
            notif_attrs = {}
            for i in range(0, len(identity_list), BATCH):
                batch = identity_list[i:i + BATCH]
                resp = ses.get_identity_notification_attributes(Identities=batch)
                notif_attrs.update(resp.get("NotificationAttributes", {}))

            for identity in identity_list:
                identity_type = "Domain" if "." in identity and "@" not in identity else "EmailAddress"
                ver = verification_attrs.get(identity, {})
                dkim = dkim_attrs.get(identity, {})
                notif = notif_attrs.get(identity, {})

                rows.append({
                    "identity":                identity,
                    "identity_type":           identity_type,
                    "profile_name":            profile["name"],
                    "profile_color":           profile["color"],
                    "profile_env":             profile.get("env_tag", "other"),
                    "region":                  region,
                    "verification_status":     ver.get("VerificationStatus", "NotStarted"),
                    "dkim_enabled":            dkim.get("DkimEnabled", False),
                    "dkim_verification_status": dkim.get("DkimVerificationStatus", "NotStarted"),
                    "bounce_topic_arn":        notif.get("BounceTopic") or None,
                    "complaint_topic_arn":     notif.get("ComplaintTopic") or None,
                    "delivery_topic_arn":      notif.get("DeliveryTopic") or None,
                    "forwarding_enabled":      notif.get("ForwardingEnabled", True),
                })
        except Exception as e:
            rows.append({
                "identity":                f"Error ({region}): {str(e)}",
                "identity_type":           "EmailAddress",
                "profile_name":            profile["name"],
                "profile_color":           profile["color"],
                "profile_env":             profile.get("env_tag", "other"),
                "region":                  region,
                "verification_status":     "Failed",
                "dkim_enabled":            False,
                "dkim_verification_status": "NotStarted",
                "bounce_topic_arn":        None,
                "complaint_topic_arn":     None,
                "delivery_topic_arn":      None,
                "forwarding_enabled":      False,
            })

    return rows


def get_ses_account_stats(profile: dict) -> list[dict]:
    """
    Fetch per-region SES account-level stats for a single profile:
      - sandbox vs production (sending enabled + max24h heuristic)
      - aggregate bounce / complaint / reject counts from GetSendStatistics
        (covers the last 2 weeks of 15-minute data points)
    """
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    rows = []

    for region in regions:
        try:
            session = boto3.Session(
                aws_access_key_id=decrypt(profile["access_key"]),
                aws_secret_access_key=decrypt(profile["secret_key"]),
                region_name=region,
            )
            ses = session.client("ses")

            # Sending enabled flag
            try:
                sending_resp = ses.get_account_sending_enabled()
                sending_enabled = sending_resp.get("Enabled", True)
            except Exception:
                sending_enabled = True

            # Sandbox detection: SES sandbox accounts have a hard cap of 200 emails/day.
            # Production accounts always have > 200. We also cross-check with the quota.
            try:
                quota_resp = ses.get_send_quota()
                max_24h = quota_resp.get("Max24HourSend", 0.0)
            except Exception:
                max_24h = 0.0

            # Accounts in sandbox are capped at exactly 200/day by AWS.
            # Any value > 200 means production access has been granted.
            in_sandbox = (max_24h <= 200.0) if max_24h > 0 else True

            # Aggregate send statistics (last ~14 days of 15-min buckets)
            total_delivery_attempts = 0
            total_bounces = 0
            total_complaints = 0
            total_rejects = 0

            try:
                stats_resp = ses.get_send_statistics()
                for dp in stats_resp.get("SendDataPoints", []):
                    total_delivery_attempts += dp.get("DeliveryAttempts", 0)
                    total_bounces           += dp.get("Bounces", 0)
                    total_complaints        += dp.get("Complaints", 0)
                    total_rejects           += dp.get("Rejects", 0)
            except Exception:
                pass

            rows.append({
                "profile_name":            profile["name"],
                "profile_color":           profile["color"],
                "profile_env":             profile.get("env_tag", "other"),
                "region":                  region,
                "sending_enabled":         sending_enabled,
                "in_sandbox":              in_sandbox,
                "max_24_hour_send":        max_24h,
                "total_delivery_attempts": total_delivery_attempts,
                "total_bounces":           total_bounces,
                "total_complaints":        total_complaints,
                "total_rejects":           total_rejects,
            })
        except Exception as e:
            rows.append({
                "profile_name":            profile["name"],
                "profile_color":           profile["color"],
                "profile_env":             profile.get("env_tag", "other"),
                "region":                  region,
                "sending_enabled":         False,
                "in_sandbox":              True,
                "max_24_hour_send":        0.0,
                "total_delivery_attempts": 0,
                "total_bounces":           0,
                "total_complaints":        0,
                "total_rejects":           0,
            })

    return rows


def get_ses_sending_quota(profile: dict) -> list[dict]:
    """Fetch SES sending quota for a single profile across all its regions."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    rows = []

    for region in regions:
        try:
            session = boto3.Session(
                aws_access_key_id=decrypt(profile["access_key"]),
                aws_secret_access_key=decrypt(profile["secret_key"]),
                region_name=region,
            )
            ses = session.client("ses")
            quota = ses.get_send_quota()

            rows.append({
                "profile_name":        profile["name"],
                "profile_color":       profile["color"],
                "profile_env":         profile.get("env_tag", "other"),
                "region":              region,
                "max_24_hour_send":    quota.get("Max24HourSend", 0.0),
                "max_send_rate":       quota.get("MaxSendRate", 0.0),
                "sent_last_24_hours":  quota.get("SentLast24Hours", 0.0),
            })
        except Exception as e:
            rows.append({
                "profile_name":        profile["name"],
                "profile_color":       profile["color"],
                "profile_env":         profile.get("env_tag", "other"),
                "region":              region,
                "max_24_hour_send":    0.0,
                "max_send_rate":       0.0,
                "sent_last_24_hours":  0.0,
            })

    return rows
