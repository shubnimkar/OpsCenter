import boto3


PROFILES = [
    "main",
    "poc",
    "kdms"
]


def get_name(tags):
    if not tags:
        return "-"

    for tag in tags:
        if tag["Key"] == "Name":
            return tag["Value"]

    return "-"


def get_instances():

    rows = []

    for profile in PROFILES:

        session = boto3.Session(profile_name=profile)
        ec2 = session.client("ec2")

        paginator = ec2.get_paginator("describe_instances")

        for page in paginator.paginate():

            for reservation in page["Reservations"]:

                for instance in reservation["Instances"]:

                    rows.append(
                        {
                            "Profile": profile,
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

    return rows
