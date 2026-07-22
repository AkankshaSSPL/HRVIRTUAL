import logging
import smtplib
from email.message import EmailMessage
from app.core.config import settings

logger = logging.getLogger(__name__)

def send_welcome_email(employee) -> bool:
    """
    Send a welcome email to the employee's personal email.
    Returns True if sent successfully, False otherwise.
    """
    if not settings.email_enabled:
        logger.info(f"Email disabled. Would send welcome email to {employee.personal_email}")
        return False

    if not employee.personal_email:
        logger.error("No personal email address for employee")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = f"Welcome to the team, {employee.first_name or 'New Employee'}!"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = employee.personal_email
        msg.set_content(f"""
Dear {employee.first_name or 'Employee'},

Welcome to {employee.department.name if employee.department else 'our company'}!

We are excited to have you on board. Your onboarding is now complete.
Your employee code is: {employee.employee_code}
Your official email is: {employee.official_email}

Please contact HR if you have any questions.

Best regards,
HR Team
""")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"Welcome email sent to {employee.personal_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        return False