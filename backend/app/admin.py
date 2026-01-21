from sqladmin import Admin, ModelView
from .models import TokenLog, User, Task, Job
from .database import engine
from pathlib import Path

class TokenLogAdmin(ModelView, model=TokenLog):
    name = "Token Usage"
    name_plural = "Token Usage Logs"
    icon = "fa-solid fa-chart-line"
    column_list = [
        TokenLog.id,
        TokenLog.timestamp,
        "user.username",
        TokenLog.feature,
        TokenLog.model,
        TokenLog.prompt_tokens,
        TokenLog.completion_tokens,
        TokenLog.cost_usd,
        TokenLog.latency_ms,
    ]
    column_details_list = [
        TokenLog.id,
        TokenLog.timestamp,
        "user.username",
        TokenLog.user_id,
        TokenLog.feature,
        TokenLog.model,
        TokenLog.prompt_tokens,
        TokenLog.completion_tokens,
        TokenLog.total_tokens,
        TokenLog.cost_usd,
        TokenLog.latency_ms,
    ]
    column_labels = {
        "user.username": "User",
        "prompt_tokens": "Input Tokens",
        "completion_tokens": "Output Tokens",
    }
    column_default_sort = [(TokenLog.timestamp, True)]
    column_searchable_list = [TokenLog.feature, "user.username"]
    can_create = False
    can_edit = False
    can_delete = False
    can_view_details = True
    column_formatters = {
        TokenLog.cost_usd: lambda m, a: f"${m.cost_usd:.6f}" if m.cost_usd is not None else "$0.000000",
        TokenLog.latency_ms: lambda m, a: f"{m.latency_ms:.0f}ms" if m.latency_ms is not None else "0ms",
    }

class UserAdmin(ModelView, model=User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-users"
    column_list = [User.id, User.username, User.email]
    column_searchable_list = [User.username, User.email]
    can_delete = False

class TaskAdmin(ModelView, model=Task):
    name = "Task"
    name_plural = "Tasks"
    icon = "fa-solid fa-calendar-check"
    column_list = [Task.id, Task.title, Task.user_id, Task.start_time]
    column_default_sort = [(Task.start_time, True)]

class JobAdmin(ModelView, model=Job):
    name = "Job"
    name_plural = "AI Jobs"
    icon = "fa-solid fa-brain"
    column_list = [Job.id, Job.user_id, Job.status, Job.created_at]

def setup_admin(app):
    base_path = Path(__file__).resolve().parent.parent
    templates_dir = base_path / "templates"
    admin = Admin(app, engine, title="Momentra Admin Dashboard", templates_dir=str(templates_dir))
    admin.add_view(TokenLogAdmin)
    admin.add_view(UserAdmin)
    admin.add_view(TaskAdmin)
    admin.add_view(JobAdmin)
    return admin
