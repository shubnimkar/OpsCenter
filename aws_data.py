import boto3
from database import get_connection


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
            cur.execute("SELECT name, access_key, secret_key, region FROM profiles ORDER BY name")
            return cur.fetchall()


def get_instances():
    profiles = get_profiles_from_db()

    if not profiles:
        return []

    rows = []

    for profile in profiles:
        try:
            session = boto3.Session(
                aws_access_key_id=profile["access_key"],
                aws_secret_access_key=profile["secret_key"],
                region_name=profile["region"],
            )
            ec2 = session.client("ec2")
            paginator = ec2.get_paginator("describe_instances")

            for page in paginator.paginate():
                for reservation in page["Reservations"]:
                    for instance in reservation["Instances"]:
                        rows.append(
                            {
                                "Profile": profile["name"],
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
            # Don't let one bad profile break the entire response
            rows.append({
                "Profile": profile["name"],
                "Name": f"Error: {str(e)}",
                "State": "error",
                "Instance ID": "-",
                "Instance Type": "-",
                "Public IP": "-",
                "Private IP": "-",
                "Public DNS": "-",
                "AZ": "-",
            })

    return rows
